"""Add a simplified MakeHuman skeleton and skin weights to the FITROOM mannequin GLB.

Run from the repository root (numpy only), after generate_avatar_details.py:

    python docs/assets/source/generate_rig.py

Source (CC0, see makehuman-rig/README.md): MakeHuman 1.1 default skeleton `default.mhskel` and weights
`default_weights.mhw`. The 163 MakeHuman bones are merged into 20 display bones; fingers go into the hand,
toes into the foot, face bones into the head, twist bones into their limb.

What it writes to public/models/mannequin.glb:
  - JOINTS_0 (4 x u8) / WEIGHTS_0 (4 x f32) on the body primitive: the four strongest display bones per vertex,
    weights summing to 1. POSITION, NORMAL, indices, morph targets and colours are not touched.
  - meshes[0].extras.rig = {bones: [{name, parent, head, deltas}]}: bone head positions in mannequin space and
    how far each head moves at morph weight +1 for every body-shape target (local affine fit of the body
    morph deltas around the joint, the same way the eyes follow the face). The app rebuilds the skeleton for
    the current body from these and poses the body, eyes, hair and the draped garments with it.

The fitting maths (section tables, cloth simulation, fit map) keep using the unposed A-pose body.
"""
from __future__ import annotations

import json
import struct
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
GLB = ROOT / "public" / "models" / "mannequin.glb"
RIG = HERE / "makehuman-rig"

# display bone -> (parent, MakeHuman bone whose head is this bone's head, MakeHuman bones merged into it)
DISPLAY = {
    "hips": (None, "root", ["root", "pelvis.L", "pelvis.R"]),
    "spine1": ("hips", "spine05", ["spine05", "spine04"]),
    "spine2": ("spine1", "spine03", ["spine03"]),
    "spine3": ("spine2", "spine02", ["spine02", "spine01", "breast.L", "breast.R"]),
    "neck": ("spine3", "neck01", ["neck01", "neck02", "neck03"]),
    "head": ("neck", "head", ["head"]),
}
for s in ("L", "R"):
    DISPLAY.update({
        f"clavicle.{s}": ("spine3", f"clavicle.{s}", [f"clavicle.{s}", f"shoulder01.{s}"]),
        f"upperarm.{s}": (f"clavicle.{s}", f"upperarm01.{s}", [f"upperarm01.{s}", f"upperarm02.{s}"]),
        f"forearm.{s}": (f"upperarm.{s}", f"lowerarm01.{s}", [f"lowerarm01.{s}", f"lowerarm02.{s}"]),
        f"hand.{s}": (f"forearm.{s}", f"wrist.{s}", [f"wrist.{s}"]),
        f"thigh.{s}": ("hips", f"upperleg01.{s}", [f"upperleg01.{s}", f"upperleg02.{s}"]),
        f"shin.{s}": (f"thigh.{s}", f"lowerleg01.{s}", [f"lowerleg01.{s}", f"lowerleg02.{s}"]),
        f"foot.{s}": (f"shin.{s}", f"foot.{s}", [f"foot.{s}"]),
    })
ORDER = list(DISPLAY)


def read_obj(path: Path):
    verts, groups, group = [], {}, ""
    for line in path.read_text().splitlines():
        if line.startswith("v "):
            verts.append(list(map(float, line.split()[1:4])))
        elif line.startswith("g "):
            group = line[2:].strip()
        elif line.startswith("f "):
            q = [int(x.split("/")[0]) - 1 for x in line.split()[1:]]
            groups.setdefault(group, []).extend(q)
    return np.array(verts), {k: np.array(v) for k, v in groups.items()}


def read_glb(path: Path):
    data = path.read_bytes()
    json_len = struct.unpack_from("<I", data, 12)[0]
    gltf = json.loads(data[20:20 + json_len])
    bin_len = struct.unpack_from("<I", data, 20 + json_len)[0]
    return gltf, bytearray(data[20 + json_len + 8:20 + json_len + 8 + bin_len])


def write_glb(path: Path, gltf, binary: bytearray):
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    binary += b"\0" * ((4 - len(binary) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(binary)
    path.write_bytes(struct.pack("<III", 0x46546C67, 2, total) + struct.pack("<II", len(js), 0x4E4F534A) + js
                     + struct.pack("<II", len(binary), 0x004E4942) + bytes(binary))


def accessor_array(gltf, binary, index, comps=3, dtype="<f4"):
    acc = gltf["accessors"][index]
    view = gltf["bufferViews"][acc["bufferView"]]
    start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    return np.frombuffer(bytes(binary), dtype=dtype, count=acc["count"] * comps, offset=start).reshape(acc["count"], comps).astype(float)


def affine_fit(src, dst):
    x = np.hstack([src, np.ones((len(src), 1))])
    m, *_ = np.linalg.lstsq(x, dst, rcond=None)
    return m


def affine_apply(m, pts):
    return np.hstack([pts, np.ones((len(pts), 1))]) @ m


def main():
    skel = json.loads((RIG / "default.mhskel").read_text(encoding="utf-8"))
    weights = json.loads((RIG / "default_weights.mhw").read_text(encoding="utf-8"))["weights"]
    base, groups = read_obj(HERE / "base.obj")
    used = np.unique(groups["body"])
    gltf, binary = read_glb(GLB)
    body = gltf["meshes"][0]
    prim = body["primitives"][0]
    if "JOINTS_0" in prim["attributes"]:
        raise SystemExit("mannequin.glb already has a rig; restore it before running again")
    names = body["extras"]["targetNames"]
    P = accessor_array(gltf, binary, prim["attributes"]["POSITION"])
    deltas = {names[i]: accessor_array(gltf, binary, t["POSITION"]) for i, t in enumerate(prim["targets"])}
    if len(used) != len(P):
        raise SystemExit("body vertex mapping does not match the mannequin")
    B = base[used]
    base_to_body = {int(b): i for i, b in enumerate(used)}

    # ------------------------------------------------ joints: base.obj joint cubes -> mannequin space
    def joint_base(name):
        return base[skel["joints"][name]].mean(0)

    report = {"bones": {}}
    bones = []
    for name in ORDER:
        parent, source, _ = DISPLAY[name]
        jb = joint_base(skel["bones"][source]["head"])
        # Local affine fit on the 80 body vertices nearest to the joint (in base.obj space), so joints inside
        # the pelvis or shoulder follow the reshaped mannequin around them.
        near = np.argsort(np.linalg.norm(B - jb, axis=1))[:80]
        m = affine_fit(B[near], P[near])
        head = affine_apply(m, jb[None])[0]
        residual = np.linalg.norm(affine_apply(m, B[near]) - P[near], axis=1)
        moved = {t: affine_apply(affine_fit(P[near], deltas[t][near]), head[None])[0] for t in names}
        bones.append({"name": name, "parent": ORDER.index(parent) if parent else -1,
                      "head": [round(float(v), 5) for v in head],
                      "deltas": {t: [round(float(v), 5) for v in d] for t, d in moved.items()}})
        report["bones"][name] = {"head": [round(float(v), 4) for v in head], "fitResidualMm": round(float(residual.max()) * 1000, 2)}

    # The pelvis centre sits deep inside the body and its nearest surface vertices are all below it (crotch,
    # buttocks), so the local fit drifts ~8 cm backwards. Put the hips pivot midway between the hip joints.
    hips, left, right = (next(b for b in bones if b["name"] == n) for n in ("hips", "thigh.L", "thigh.R"))
    hips["head"] = [round((a + b) / 2, 5) for a, b in zip(left["head"], right["head"])]
    hips["deltas"] = {t: [round((a + b) / 2, 5) for a, b in zip(left["deltas"][t], right["deltas"][t])] for t in names}
    report["bones"]["hips"] = {"head": hips["head"], "fitResidualMm": "midpoint of the hip joints"}

    # ------------------------------------------------ weights: merge MakeHuman bones into display bones
    owner = {}
    for name, (_, _, members) in DISPLAY.items():
        for mh in members:
            owner[mh] = name
    def display_of(mh):
        while mh not in owner:
            mh = skel["bones"][mh]["parent"]
            if mh is None:
                raise SystemExit("bone without a display parent")
        return owner[mh]

    W = np.zeros((len(P), len(ORDER)))
    for mh, pairs in weights.items():
        col = ORDER.index(display_of(mh))
        for vi, w in pairs:
            i = base_to_body.get(int(vi))
            if i is not None:
                W[i, col] += w
    missing = int((W.sum(1) <= 0).sum())
    if missing:
        # vertices the source weights skip (none expected): give them their nearest weighted neighbour's weights
        have = W.sum(1) > 0
        for i in np.nonzero(~have)[0]:
            j = np.nonzero(have)[0][np.argmin(np.linalg.norm(P[have] - P[i], axis=1))]
            W[i] = W[j]
    top = np.argsort(-W, axis=1)[:, :4]
    tw = np.take_along_axis(W, top, axis=1)
    tw = tw / tw.sum(1, keepdims=True)
    joints = np.where(tw > 0, top, 0).astype(np.uint8)
    tw = np.where(tw > 0, tw, 0).astype("<f4")
    report["vertexWeights"] = {"filledFromNeighbour": missing, "maxInfluences": int((tw > 0).sum(1).max()),
                               "droppedWeightMax": round(float(1 - np.take_along_axis(W, top, 1).sum(1).max() / W.sum(1).max()), 4)}

    # ------------------------------------------------ append to the GLB (body data untouched)
    def append(arr: np.ndarray, comp_type: int, kind: str):
        while len(binary) % 4:
            binary.append(0)
        offset = len(binary)
        binary.extend(arr.tobytes())
        gltf["bufferViews"].append({"buffer": 0, "byteOffset": offset, "byteLength": arr.nbytes, "target": 34962})
        gltf["accessors"].append({"bufferView": len(gltf["bufferViews"]) - 1, "componentType": comp_type, "count": len(arr), "type": kind})
        return len(gltf["accessors"]) - 1

    body_before = bytes(binary)
    prim["attributes"]["JOINTS_0"] = append(joints, 5121, "VEC4")
    prim["attributes"]["WEIGHTS_0"] = append(tw, 5126, "VEC4")
    body.setdefault("extras", {})["rig"] = {"source": "MakeHuman 1.1 default skeleton + default_weights (CC0), merged to 20 bones", "bones": bones}
    gltf["buffers"][0]["byteLength"] = len(binary)
    assert bytes(binary[:len(body_before)]) == body_before
    write_glb(GLB, gltf, binary)
    report["glbBytes"] = GLB.stat().st_size
    (HERE / "rig-report.json").write_text(json.dumps(report, indent=1, ensure_ascii=False))
    print(json.dumps({k: report[k] for k in ("vertexWeights", "glbBytes")}, indent=1))
    for name in ORDER:
        print(name, report["bones"][name])


if __name__ == "__main__":
    main()
