# Fitroom MakeHuman mannequin v2

## Source and license

Official MakeHuman body mesh, CC0 1.0 Universal. Source, hash, and license evidence are retained in `PROVENANCE.md`, `base.obj`, `MAKEHUMAN_LICENSE.md`, and `LICENSE.ASSETS.md`.

Source: https://raw.githubusercontent.com/makehumancommunity/makehuman/master/makehuman/data/3dobjs/base.obj

## Files

- `mannequin-v2.glb`: final GLB 2.0 asset with seven named position/normal morph targets.
- `generate_mannequin_v2.py`: reproducible generator; `/usr/local/bin/python3`, numpy, scipy, Pillow.
- `calibration-v2.json`: neutral measurements and slider mapping.
- `mannequin-v2-qa.png`: software shaded front/profile QA.
- `qa-report-v2.json`: geometry/buffer summary.

## Neutral geometry and target calibration

Height: 175 cm. +Y up; +Z front; soles Y=0; meters; A-pose. Chest, waist and hips were iteratively baked to the UI defaults and verified by horizontal mesh cross sections. Head was scaled horizontally to a 57 cm cranium section.

| Target | Neutral UI value (cm) | Change at weight +1 (cm) | Measurement |
|---|---:|---:|---|
| chest | 96 | 50 | Body cross-section at Y=1.30 m |
| waist | 80 | 60 | Body cross-section at Y=1.12 m |
| hips | 98 | 55 | Body cross-section at Y=0.95 m |
| shoulders | 43 | 10 | UI-relative lateral shoulder expansion |
| armLength | 59 | 15 | UI-relative shoulder-to-wrist length change |
| legLength | 105 | 20 | UI waist-height control; vertical stretch from ground to Y=1.05 m |
| head | 57 | 13 | Head circumference section at Y=1.66 m |

Default weights are all zero. Each target supports weights [-1,1]. Recommended mapping at height 175 cm: `weight = clamp((inputCm - neutralUiCm) / changePerWeight, -1, 1)`. The shoulders/armLength/legLength values are deliberately UI-relative offsets, not standardized tailoring measurements: source shoulder joint spacing is 35.24 cm and shoulder-to-wrist joint length is 47.79 cm. Only chest/waist/hips/head have absolute neutral circumference calibration.

If the mesh is subsequently uniformly scaled, all circumference/length changes scale with it. For a fully dimension-aware mapping, divide the requested lengths by the applied height scale before converting to morph weights. `legLength` also changes total native height by 0.20 m per weight; normalizing to an exact requested total stature afterwards will reduce its absolute effect. Keep this interaction visible in the product's approximation language.

## Avatar details (face, eyes, brows)

`public/models/mannequin.glb` is the v2 mannequin plus display-only face details added by `source/generate_avatar_details.py` (numpy; run it on the v2 GLB, it refuses a GLB that already has the details). `source/avatar-details-report.json` records its output.

- Body mesh: unchanged positions, normals, indices and morph targets (the script checks the body buffer and primitive byte for byte). It only adds a `COLOR_0` multiplier per vertex for lips, eyelid creases and cheeks, so the chosen skin colour shows through.
- `Eye_L`, `Eye_R` (nodes `Fitroom_Eye_L/R`): spheres with white, iris and pupil vertex colours. Centres and sizes come from MakeHuman's `helper-l-eye`/`helper-r-eye` groups in `base.obj`, mapped into mannequin space with a local affine fit around each eye (residual under 1 mm).
- `Brows` (node `Fitroom_Brows`): two thin ribbons projected onto the face surface and lifted 0.8 mm along the normal.
- Eyes and brows carry the same seven position morph targets as the body, estimated from the body's morph deltas near each eye, so they follow head and height changes.

Hair is not part of the asset. `lib/wardrobe/hair.ts` builds it in the browser from the morphed head (see `docs/ARCHITECTURE.md`).

## Skeleton and skin weights

`source/generate_rig.py` (numpy) adds a display skeleton to `public/models/mannequin.glb`, built from the MakeHuman 1.1 default rig (`source/makehuman-rig/`, CC0). Run it after `generate_avatar_details.py`; it refuses a GLB that already has a rig. `source/rig-report.json` records its output.

- 20 bones: hips, spine1-3, neck, head, and per side clavicle, upperarm, forearm, hand, thigh, shin, foot. The 163 MakeHuman bones are merged into them (fingers into the hand, toes into the foot, face bones into the head, twist bones into their limb).
- Body primitive: `JOINTS_0` (4 x u8) and `WEIGHTS_0` (4 x f32, sum 1) are added. POSITION, NORMAL, indices, morph targets and colours are unchanged.
- `meshes[0].extras.rig.bones`: bone head positions in mannequin space and how far each head moves at morph weight +1 for every body-shape target (local affine fit of the body morph deltas around the joint). The hips pivot is the midpoint of the two hip joints.
- The app keeps every fitting computation (section tables, cloth simulation, fit map) on the unposed A-pose body and only poses what it draws (`lib/wardrobe/rig.ts`).

## Limitations

These local morphs approximate body-shape differences. They are not a fitted anthropometric model, and simultaneous morphs interact. The wide mathematical range permits extreme silhouettes; some combinations are anatomically unrealistic and may cause local self-intersection. The model does not simulate cloth or predict garment fit. No animation clips; the display skeleton above is added separately and poses only what the app draws. Face, ears, hands and toes remain from MakeHuman; helper/genital geometry is excluded and the chest uses a smooth mannequin shell.
