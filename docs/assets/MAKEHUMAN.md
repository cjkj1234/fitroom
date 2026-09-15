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

## Limitations

These local morphs approximate body-shape differences. They are not a fitted anthropometric model, and simultaneous morphs interact. The wide mathematical range permits extreme silhouettes; some combinations are anatomically unrealistic and may cause local self-intersection. The model does not simulate cloth or predict garment fit. No skeleton or animation clips. Face, ears, hands and toes remain from MakeHuman; helper/genital geometry is excluded and the chest uses a smooth mannequin shell.
