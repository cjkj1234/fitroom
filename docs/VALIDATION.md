# Validation record

## Passed

Production build and TypeScript checks passed on 2026-09-15. The local preview returned HTTP 200. A separate local build folder was used after macOS cloud-only files blocked reads in the original Documents folder.

Automated tests cover the small-shop demo catalog, seller publishing and migration, flat-width/circumference conversion, negative ease, missing dimensions, elastic waist and adjustable cap deferral, slot replacement/removal, invalid sizes, body ranges, presets, storage normalization, finite garment geometry, fixed garment dimensions across body girths, ellipse math, photo postprocessing, manual input precedence, bad photo evidence, and WebMCP input validation.

On 2026-09-25, 68 automated tests, TypeScript checking, and a production build passed. A local D1 account workspace was saved through the authenticated seller API. The anonymous catalog endpoint returned only its ready, published store and product, without an account identifier. The shopper street then showed the server store, entered its seller-curated floor, exposed the placed product, price, stock, measurements and purchase link, and retained no horizontal overflow at a 390px viewport.

On 2026-09-29, a clean reproduction was run from the git-tracked files in a folder outside iCloud (Node 22.23): `npm ci` (36 s), 96 automated tests (rerun as 102 after the photo-texture work later that day, again with the TypeScript check and a production build passing), the TypeScript check, the ad-evaluation dry run (4 real inputs, 4/4 invalid inputs rejected) and a production build (about 20 s) all passed. The project folder itself lives in an iCloud-synced Documents directory where the system evicts files to free disk space; reading evicted large files (a 5 MB git pack, a 3 MB GLB) stalls, and the dev server, build and bulk copies hang there. All runs and browser checks therefore used a copy outside iCloud that was kept in sync with the working folder. The real-model ad evaluation of the same day is in `docs/evaluations/runs/`; its quality scores are an AI-assisted review, not the final human rating.

On 2026-09-30 the ad prompt was revised five times (2026-09-30.1 to .5) and the automatic review gained checks for copied requests, missing purpose wording, repeated sentences and openings, list-price wording, comfort claims, talk about missing input, AI-sounding phrases and material-as-reason claims. The server also stopped sending empty fields to the model. 112 automated tests, the TypeScript check and the ad-evaluation dry run passed.

The same four inputs were regenerated against the real model with each prompt version, three runs each from version .2 on (56 model calls in total; files in `docs/evaluations/runs/` and `runs/repeats/`, summary by `scripts/summarize-ad-runs.ts`). Average response time was 6.3 to 7.2 s per version, against 19.1 s in the first run, but reasoning effort was also lowered to `low`, so the speed-up is not due to the prompt alone. Two of the 56 calls timed out at 30 s and 45 s for an unknown reason. The automatic checks and keyword counts are not a human rating, twelve cases per version cannot separate small differences from run-to-run variation, the fixes were chosen by reading these same four inputs (not an independent test), and two of the four inputs were changed to remove a conflict between the extra request and the tone.

Mannequin fit (2026-09-29): `lib/wardrobe/mannequin-fit.test.ts` loads the mannequin GLB, casts a ray from each mannequin vertex in the region a garment must cover, and fails when the exposed share exceeds a per-slot limit (tops 5%, bottoms 3%, hats 0.5%). Measured exposure: tops 2.5–3.2%, bottoms 0.25–1.5%, hats 0%; the shirt and carpenter-shorts samples built from real product photos were 2.5% and 0%. This checks that the body does not poke through the procedural garments on this one mannequin; it does not validate real-world garment shape or fit accuracy.

Not validated: touch behaviour and performance on a real phone, ad generation on the deployed site (no server secret is connected there), the final human rating of generated ad copy, and any measure of how closely a 3D garment matches its product photo.

The MakeHuman GLB was checked for valid indices, buffers, finite coordinates and named morph targets. Neutral circumference sections were calibrated in asset generation. Garment thumbnail images are z-buffered renders of the same geometry used by the browser.

## Accuracy limits

No paired real-person measurements, garment patterns, fabric parameters, or physical try-on study were supplied. Automated tests establish software behavior only; they do not establish real-world body-measurement or fit accuracy. Every estimate is labelled unvalidated in the UI.

Photo geometry tests use synthetic silhouettes and known landmarks. End-to-end MediaPipe detection and real-person photos require separate acceptance testing; no actual accuracy score is claimed.

## Browser contract check

Both WebMCP tools registered with their expected schemas and read/write annotations. The live preview returned the eight products and current body/outfit. Equipping top 3777371 size L updated the read-back outfit and retained bottom 3504218 size 30. Invalid size input was rejected without changing the outfit; the original top was restored. Ordinary browser UI screenshots and click interactions were not used as a substitute.

## Privacy implementation

Photo files are held in component memory/object URLs and transferred as ImageBitmap objects to a local Web Worker. The Worker fetches only same-origin model/WASM assets, reads image pixels locally, and returns derived dimensions. Object URLs are revoked and the Worker is terminated on close. The only persistent value is the normalized BodyProfile. No analytics, image upload API or user-image server storage was added.
