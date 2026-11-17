"""Add human details to the FITROOM mannequin GLB without touching the body geometry.

Run from the repository root (numpy only):

    python docs/assets/source/generate_avatar_details.py

What it adds to public/models/mannequin.glb:
  1. COLOR_0 on the body: a multiplier painted on top of the skin colour chosen in the app
     (lips, a little cheek warmth, eyelid crease). White means "skin as is".
  2. Two eye meshes (sclera, iris, pupil as vertex colours) and an eyebrow mesh, with the same seven morph
     targets as the body, so they follow the head and height morphs.

The body POSITION / NORMAL / index / morph data are copied byte for byte. The script checks this at the end,
because the cloth simulation, the body section table and the tests read the same body data.

Where the details come from (MakeHuman base.obj, CC0):
  - The mannequin body vertex i is base.obj vertex used[i] (sorted vertices of the 'body' group), exactly as
    generate_mannequin_v2.py builds it.
  - helper-l-eye / helper-r-eye and helper-upper-teeth give eye centres, eye size and the mouth position.
    They are moved into mannequin space with a local affine fit on the surrounding body vertices
    (residual below 1 mm). Only the centre and radius of the eye helper are used: the helper sphere has 72
    vertices, too coarse for an iris, so a finer sphere with its pole facing forward is generated instead.
  - Morph deltas for the eyes are a local affine fit of the body morph deltas around each eye.
"""
from __future__ import annotations

import json
import struct
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[3]
SOURCE = Path(__file__).resolve().parent / "base.obj"
GLB = ROOT / "public" / "models" / "mannequin.glb"


# ---------------------------------------------------------------- input
def read_obj(path: Path):
    verts, groups, group = [], {}, ""
    for line in path.read_text().splitlines():
        if line.startswith("v "):
            verts.append(list(map(float, line.split()[1:4])))
        elif line.startswith("g "):
            group = line[2:].strip()
        elif line.startswith("f "):
            q = [int(x.split("/")[0]) - 1 for x in line.split()[1:]]
            groups.setdefault(group, []).extend([[q[0], q[i], q[i + 1]] for i in range(1, len(q) - 1)])
    return np.array(verts), {k: np.array(v) for k, v in groups.items()}


def read_glb(path: Path):
    data = path.read_bytes()
    json_len = struct.unpack_from("<I", data, 12)[0]
    gltf = json.loads(data[20:20 + json_len])
    bin_len = struct.unpack_from("<I", data, 20 + json_len)[0]
    binary = bytearray(data[20 + json_len + 8:20 + json_len + 8 + bin_len])
    return gltf, binary


def accessor_array(gltf, binary, index, comps=3, dtype="<f4"):
    acc = gltf["accessors"][index]
    view = gltf["bufferViews"][acc["bufferView"]]
    start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    return np.frombuffer(bytes(binary), dtype=dtype, count=acc["count"] * comps, offset=start).reshape(acc["count"], comps).astype(float)


# ---------------------------------------------------------------- geometry helpers
def affine_fit(src, dst):
    x = np.hstack([src, np.ones((len(src), 1))])
    m, *_ = np.linalg.lstsq(x, dst, rcond=None)
    return m


def affine_apply(m, pts):
    return np.hstack([pts, np.ones((len(pts), 1))]) @ m


def vertex_normals(p, faces):
    t = p[faces]
    n = np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0])
    out = np.zeros_like(p)
    for j in range(3):
        np.add.at(out, faces[:, j], n)
    return out / np.maximum(np.linalg.norm(out, axis=1)[:, None], 1e-12)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


# Iris and pupil sizes as angles from the gaze axis on an eyeball of radius r: iris radius ~6 mm, pupil ~2.2 mm.
def eye_rings(radius):
    pupil = np.arcsin(min(0.0022 / radius, 1))
    iris = np.arcsin(min(0.0060 / radius, 1))
    limbus = iris * 1.07
    fine = [0.0, pupil * 0.5, pupil * 0.97, pupil * 1.03, (pupil + iris) / 2, iris * 0.93, iris * 0.99, iris * 1.01, limbus]
    coarse = list(np.linspace(limbus, np.pi, 18)[1:])
    return np.array(fine + coarse), pupil, iris, limbus


def eye_sphere(center, radius, segments=48):
    """Sphere whose pole looks forward (+Z), so pupil and iris edges fall exactly on vertex rings."""
    thetas, pupil, iris, limbus = eye_rings(radius)
    verts, colours = [], []
    sclera = np.array([0.93, 0.91, 0.88])
    iris_outer = np.array([0.24, 0.16, 0.11])
    iris_inner = np.array([0.38, 0.26, 0.17])
    pupil_c = np.array([0.03, 0.03, 0.03])
    limbal = np.array([0.12, 0.09, 0.07])
    for th in thetas:
        if th <= pupil * 0.97:
            c = pupil_c
        elif th < iris * 0.99:
            t = (th - pupil) / (iris - pupil)
            c = iris_inner * (1 - t) + iris_outer * t
        elif th <= limbus:
            c = limbal
        else:
            c = sclera * (0.96 + 0.04 * smoothstep(limbus, limbus * 2.5, th))
        ring = 1 if th == 0 else segments
        for k in range(ring):
            a = 2 * np.pi * k / segments
            d = np.array([np.sin(th) * np.cos(a), np.sin(th) * np.sin(a), np.cos(th)])
            verts.append(center + radius * d)
            colours.append(c)
    verts, colours = np.array(verts), np.array(colours)
    faces = []
    # pole fan
    for k in range(segments):
        faces.append([0, 1 + k, 1 + (k + 1) % segments])
    for r in range(1, len(thetas) - 1):
        a0 = 1 + (r - 1) * segments
        a1 = 1 + r * segments
        for k in range(segments):
            k1 = (k + 1) % segments
            faces.append([a0 + k, a1 + k, a1 + k1])
            faces.append([a0 + k, a1 + k1, a0 + k1])
    faces = np.array(faces)
    # outward normals: fan/rings were built with the pole at +Z, check orientation and flip if needed
    n = vertex_normals(verts, faces)
    if np.mean(np.sum(n * (verts - center), axis=1)) < 0:
        faces = faces[:, ::-1]
    return verts, faces, colours


def front_surface(P, faces, xs, ys):
    """z and outward normal of the front-most face surface at each (x, y): a ray from +Z onto face triangles."""
    tri = P[faces]
    keep = (tri[:, :, 1].mean(1) > 1.55) & (tri[:, :, 2].mean(1) > 0.06)
    tri = tri[keep]
    a, b, c = tri[:, 0], tri[:, 1], tri[:, 2]
    v0, v1 = c[:, :2] - a[:, :2], b[:, :2] - a[:, :2]
    d00, d01, d11 = (v0 * v0).sum(1), (v0 * v1).sum(1), (v1 * v1).sum(1)
    den = d00 * d11 - d01 * d01
    zs, normals = np.full(len(xs), np.nan), np.zeros((len(xs), 3))
    for i, (px, py) in enumerate(zip(xs, ys)):
        v2 = np.array([px, py]) - a[:, :2]
        d20, d21 = (v2 * v0).sum(1), (v2 * v1).sum(1)
        with np.errstate(divide="ignore", invalid="ignore"):
            u = (d11 * d20 - d01 * d21) / den
            v = (d00 * d21 - d01 * d20) / den
        inside = (u >= 0) & (v >= 0) & (u + v <= 1) & (np.abs(den) > 1e-14)
        if not inside.any():
            continue
        z = a[:, 2] + u * (c[:, 2] - a[:, 2]) + v * (b[:, 2] - a[:, 2])
        j = int(np.argmax(np.where(inside, z, -np.inf)))
        zs[i] = z[j]
        n = np.cross(b[j] - a[j], c[j] - a[j])
        n /= np.linalg.norm(n)
        normals[i] = n if n[2] > 0 else -n
    return zs, normals


def brow_ribbon(P, faces, eye_center, samples=26):
    """An eyebrow strip lying 0.8 mm above the skin: thicker and rounded at the inner end, thin at the tail."""
    sx = np.sign(eye_center[0])
    u = np.linspace(-0.0185, 0.026, samples)  # along the brow, >0 towards the temple
    arc = eye_center[1] + 0.0215 + 0.004 * np.exp(-((u - 0.004) / 0.016) ** 2) - 0.003 * smoothstep(0.012, 0.03, u)
    height = 0.0062 * (1 - 0.6 * smoothstep(-0.008, 0.026, u)) * (0.35 + 0.65 * smoothstep(-0.0185, -0.013, u))
    height = np.maximum(height, 0.0008)
    xs = eye_center[0] + u * sx
    rows = []
    for dy in (+0.5, -0.5):
        ys = arc + dy * height
        zs, normals = front_surface(P, faces, xs, ys)
        if np.isnan(zs).any():
            raise SystemExit("eyebrow sample missed the face surface")
        rows.append(np.stack([xs, ys, zs], axis=1) + normals * 0.0008)
    verts = np.concatenate(rows)
    quads = []
    for i in range(samples - 1):
        a, b, c, d = i, i + 1, samples + i, samples + i + 1
        quads += [[a, c, b], [b, c, d]] if sx > 0 else [[a, b, c], [b, d, c]]
    return verts, np.array(quads)


# ---------------------------------------------------------------- main
def main():
    base, groups = read_obj(SOURCE)
    used = np.unique(groups["body"])
    gltf, binary = read_glb(GLB)
    original_json = json.dumps(gltf["meshes"][0]["primitives"][0], sort_keys=True)
    body_mesh = gltf["meshes"][0]
    prim = body_mesh["primitives"][0]
    names = body_mesh["extras"]["targetNames"]
    if any(m.get("name", "").startswith("Eye") for m in gltf["meshes"]) or "COLOR_0" in prim["attributes"]:
        raise SystemExit("mannequin.glb already has avatar details; restore the original GLB before running again")
    body_bytes_before = bytes(binary)

    P = accessor_array(gltf, binary, prim["attributes"]["POSITION"])
    N = accessor_array(gltf, binary, prim["attributes"]["NORMAL"])
    faces = accessor_array(gltf, binary, prim["indices"], 1, "<u4").astype(int).reshape(-1, 3)
    deltas = {names[i]: accessor_array(gltf, binary, t["POSITION"]) for i, t in enumerate(prim["targets"])}
    if len(used) != len(P):
        raise SystemExit("body vertex mapping does not match the mannequin")
    B = base[used]

    def to_mannequin(points_base, radius=0.045):
        """Move base.obj points into mannequin space with an affine fit on nearby body vertices."""
        head = P[:, 1] > 1.45
        rough = affine_apply(affine_fit(B[head], P[head]), points_base.mean(0)[None])[0]
        near = np.linalg.norm(P - rough, axis=1) < radius
        m = affine_fit(B[near], P[near])
        residual = np.linalg.norm(affine_apply(m, B[near]) - P[near], axis=1)
        return affine_apply(m, points_base), near, residual

    report = {}
    eyes = []
    for side in ("l", "r"):
        idx = np.unique(groups[f"helper-{side}-eye"])
        pts, near, residual = to_mannequin(base[idx])
        center = pts.mean(0)
        radius = float(np.median(np.linalg.norm(pts - center, axis=1)))
        # Slightly smaller than the helper so the eyelids overlap the eyeball edge.
        radius *= 0.97
        verts, efaces, colours = eye_sphere(center, radius)
        targets = {}
        for name in names:
            m = affine_fit(P[near], deltas[name][near])
            targets[name] = affine_apply(m, verts) - verts
        eyes.append((side, verts, efaces, colours, targets, near, center))
        report[f"eye_{side}"] = {"center": np.round(center, 4).tolist(), "radiusMm": round(radius * 1000, 2),
                                 "fitResidualMm": {"mean": round(float(residual.mean()) * 1000, 3), "max": round(float(residual.max()) * 1000, 3)},
                                 "vertices": len(verts)}

    mouth_pts, _, mouth_res = to_mannequin(base[np.unique(groups["helper-upper-teeth"])])
    teeth = mouth_pts.mean(0)
    eye_l = next(e for e in eyes if e[0] == "l")[6]
    eye_r = next(e for e in eyes if e[0] == "r")[6]

    # ------------------------------------------------ eyebrows (one mesh for both), morphs fitted around each eye
    brow_verts, brow_faces, brow_targets, offset = [], [], {n: [] for n in names}, 0
    for side, _, _, _, _, near, center in eyes:
        v, f = brow_ribbon(P, faces, center)
        brow_verts.append(v)
        brow_faces.append(f + offset)
        offset += len(v)
        for name in names:
            m = affine_fit(P[near], deltas[name][near])
            brow_targets[name].append(affine_apply(m, v) - v)
    brow_verts = np.concatenate(brow_verts)
    brow_faces = np.concatenate(brow_faces)
    brow_targets = {n: np.concatenate(l) for n, l in brow_targets.items()}
    if vertex_normals(brow_verts, brow_faces)[:, 2].mean() < 0:
        brow_faces = brow_faces[:, ::-1]
    report["brows"] = {"vertices": len(brow_verts), "triangles": len(brow_faces)}

    # ------------------------------------------------ face colour multipliers (1 = skin as is)
    x, y, z = P.T
    front = np.clip((N[:, 2] - 0.15) / 0.5, 0, 1)
    face = (y > 1.45) & (z > 0.03)
    colour = np.ones((len(P), 3))

    def tint(weight, rgb):
        nonlocal colour
        w = np.clip(weight, 0, 1)[:, None]
        colour = colour * (1 - w) + colour * np.array(rgb)[None] * w

    # Lips: the surface in front of the teeth. Upper lip a little above, lower lip a little below the teeth centre.
    lip_y = teeth[1] - 0.004
    lips = np.exp(-((x / 0.020) ** 4)) * np.exp(-(((y - lip_y) / 0.0085) ** 4)) * smoothstep(teeth[2] - 0.004, teeth[2] + 0.010, z)
    tint(lips * face * front * 0.75, (0.84, 0.63, 0.61))
    # Eyebrows are geometry (see brow_ribbon below): face vertices are ~4 mm apart, too coarse to paint a brow.
    # Upper eyelid crease: a soft shadow just above each eye.
    lids = np.zeros(len(P))
    for c in (eye_l, eye_r):
        d = np.hypot((x - c[0]) / 0.016, (y - (c[1] + 0.008)) / 0.006)
        lids = np.maximum(lids, np.exp(-d ** 2))
    tint(lids * face * front * 0.6, (0.88, 0.80, 0.78))
    # Cheeks: very light warmth below and outside the eyes.
    cheeks = np.zeros(len(P))
    for c in (eye_l, eye_r):
        d = np.hypot((x - (c[0] + np.sign(c[0]) * 0.012)) / 0.022, (y - (c[1] - 0.032)) / 0.018)
        cheeks = np.maximum(cheeks, np.exp(-d ** 2))
    tint(cheeks * face * front * 0.7, (0.97, 0.88, 0.86))
    colour = np.clip(colour, 0, 1)

    # ------------------------------------------------ write GLB
    views, accessors = gltf["bufferViews"], gltf["accessors"]

    def add(arr, kind, component=5126, target=34962, normalized=False):
        arr = np.ascontiguousarray(arr)
        while len(binary) % 4:
            binary.append(0)
        offset = len(binary)
        binary.extend(arr.tobytes())
        view = {"buffer": 0, "byteOffset": offset, "byteLength": arr.nbytes}
        if target:
            view["target"] = target
        views.append(view)
        count = len(arr) if arr.ndim > 1 or kind == "SCALAR" else len(arr)
        acc = {"bufferView": len(views) - 1, "componentType": component, "count": int(count), "type": kind}
        if normalized:
            acc["normalized"] = True
        if kind == "VEC3" and component == 5126:
            acc["min"] = arr.min(0).tolist()
            acc["max"] = arr.max(0).tolist()
        accessors.append(acc)
        return len(accessors) - 1

    # glTF COLOR_0 is linear. The multipliers above are chosen as sRGB-looking factors, so convert them.
    def linear_rgba(c):
        return np.concatenate([np.round(np.clip(c, 0, 1) ** 2.2 * 255), np.full((len(c), 1), 255)], axis=1).astype("<u1")

    prim["attributes"]["COLOR_0"] = add(linear_rgba(colour), "VEC4", 5121, normalized=True)

    eye_material = len(gltf["materials"])
    gltf["materials"].append({"name": "Eye", "pbrMetallicRoughness": {"baseColorFactor": [1, 1, 1, 1], "metallicFactor": 0, "roughnessFactor": 0.1}})
    for side, verts, efaces, colours, targets, _, _ in eyes:
        normals = vertex_normals(verts, efaces)
        rgba_e = linear_rgba(colours)
        p_attr = {"POSITION": add(verts.astype("<f4"), "VEC3"), "NORMAL": add(normals.astype("<f4"), "VEC3"),
                  "COLOR_0": add(rgba_e, "VEC4", 5121, normalized=True)}
        index = add(efaces.astype("<u4").ravel(), "SCALAR", 5125, 34963)
        # Eyes only move and scale with the head, so position deltas are enough (no normal deltas).
        t_list = [{"POSITION": add(targets[name].astype("<f4"), "VEC3")} for name in names]
        gltf["meshes"].append({"name": f"Eye_{side.upper()}", "weights": [0] * len(names), "extras": {"targetNames": names},
                               "primitives": [{"attributes": p_attr, "indices": index, "material": eye_material, "targets": t_list}]})
        gltf["nodes"].append({"mesh": len(gltf["meshes"]) - 1, "name": f"Fitroom_Eye_{side.upper()}"})
        gltf["scenes"][0]["nodes"].append(len(gltf["nodes"]) - 1)

    brow_material = len(gltf["materials"])
    gltf["materials"].append({"name": "Brow", "pbrMetallicRoughness": {"baseColorFactor": [0.2, 0.15, 0.12, 1], "metallicFactor": 0, "roughnessFactor": 0.9}})
    b_attr = {"POSITION": add(brow_verts.astype("<f4"), "VEC3"), "NORMAL": add(vertex_normals(brow_verts, brow_faces).astype("<f4"), "VEC3")}
    b_index = add(brow_faces.astype("<u4").ravel(), "SCALAR", 5125, 34963)
    b_targets = [{"POSITION": add(brow_targets[name].astype("<f4"), "VEC3")} for name in names]
    gltf["meshes"].append({"name": "Brows", "weights": [0] * len(names), "extras": {"targetNames": names},
                           "primitives": [{"attributes": b_attr, "indices": b_index, "material": brow_material, "targets": b_targets}]})
    gltf["nodes"].append({"mesh": len(gltf["meshes"]) - 1, "name": "Fitroom_Brows"})
    gltf["scenes"][0]["nodes"].append(len(gltf["nodes"]) - 1)

    gltf["buffers"][0]["byteLength"] = len(binary)
    gltf["asset"]["extras"] = {"avatarDetails": "generate_avatar_details.py: COLOR_0 face multipliers and generated eyes; body geometry unchanged"}

    # body data must be byte-identical
    if bytes(binary[:len(body_bytes_before)]) != body_bytes_before:
        raise SystemExit("body buffer changed")
    check = dict(json.loads(json.dumps(gltf["meshes"][0]["primitives"][0])))
    check["attributes"] = {k: v for k, v in check["attributes"].items() if k != "COLOR_0"}
    if json.dumps(check, sort_keys=True) != original_json:
        raise SystemExit("body primitive changed")

    j = json.dumps(gltf, separators=(",", ":")).encode()
    j += b" " * ((-len(j)) % 4)
    binary += b"\0" * ((-len(binary)) % 4)
    GLB.write_bytes(struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(j) + 8 + len(binary)) + struct.pack("<I4s", len(j), b"JSON") + j + struct.pack("<I4s", len(binary), b"BIN\0") + binary)

    report.update({
        "mouthFitResidualMm": {"mean": round(float(mouth_res.mean()) * 1000, 3), "max": round(float(mouth_res.max()) * 1000, 3)},
        "teethCenter": np.round(teeth, 4).tolist(),
        "paintedVertices": {"lips": int((lips * face * front > 0.2).sum())},
        "glbBytes": GLB.stat().st_size,
    })
    (Path(__file__).resolve().parent / "avatar-details-report.json").write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
