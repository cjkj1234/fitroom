# Fitroom neutral MakeHuman mannequin

## Source and license

- Official source mesh: https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/3dobjs/base.obj
- Source project: https://github.com/makehumancommunity/makehuman
- Retrieved: 2026-09-15
- Author: MakeHuman community / MakeHuman Team
- Source SHA-256: `8e761e6624b8f54536409135d1636da63b32486a90d4897f84e121d144f6fb4c`
- Asset license: **CC0 1.0 Universal**. Full legal text retained in `LICENSE.ASSETS.md`; upstream license explanation retained in `MAKEHUMAN_LICENSE.md`.
- Official license explanation: https://static.makehumancommunity.org/about/license.html

Only the graphical base mesh is used; no MakeHuman application code is incorporated.

## Processing

`generate_mannequin.py` extracts the `body` face group, discards all helper and joint meshes, triangulates its polygons, normalizes to 1.75 m with soles at Y = 0, locally smooths torso detail, replaces the anterior chest surface with a smooth elliptical mannequin shell, computes smooth normals and six procedural morph targets, and packages a GLB 2.0 with a neutral matte material.

Coordinates: +Y up, +Z front, meters. Mesh has 13,380 vertices and 26,756 triangles. Relaxed A-pose. The source body's facial and finger geometry remains. No genital helper, eyelashes, hair, teeth or textured skin is included. The mesh has neither a skeleton nor animation clips.

## Integration

Load `mannequin.glb` with Three.js GLTFLoader. Traverse the loaded scene to find the mesh. Its `morphTargetDictionary` exposes `chest`, `waist`, `hips`, `shoulders`, `armLength`, and `legLength`. Set the corresponding `morphTargetInfluences` in **[-1, 1]**; 0 is the neutral reference.

Neutral reference: 175 cm height, 82.03 cm chest, 70.12 cm waist, 98.20 cm hips. Chest/waist/hips each change by approximately +14 cm circumference at weight +1. Shoulder joint spacing reference is 35.24 cm and changes by approximately +6 cm at +1. Arm shoulder-to-wrist reference is 47.79 cm, changing approximately +5.73 cm. Hip-to-ground reference is 91 cm, changing +7 cm. See `calibration.json` for exact values and measurement levels.

For a first approximation use `(desiredCm / heightScale - referenceCm) / cmPerWeight`, clamped to [-1, 1]. Set `heightScale = desiredHeightCm / 175`. When legLength is nonzero it increases the native total height by `0.07 * weight` meters; if preserving a requested total stature, use `heightScale = desiredHeightM / (1.75 + 0.07 * legWeight)` after applying morphs.

Morphs overlap and can interact. These are qualitative shape controls and approximate mesh dimensions, not a calibrated anthropometric model. They do not predict garment fit or simulate fabric. Extreme simultaneous settings can distort anatomy. Shoulder, arm and leg reference values describe joint distances, not standardized tailoring measurements.

## Reproduction and QA

Run `python3 generate_mannequin.py` in this directory. Dependencies: numpy, scipy, Pillow. The original mesh is included as `base.obj`.

`mannequin-qa.png` is a front/profile software-rendered geometry check. Its flat triangle rasterization appears more faceted than the smooth normals used by Three.js. `qa-report.json` records bounds, target names, finite geometry verification and source hash.
