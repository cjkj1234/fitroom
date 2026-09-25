# Validation record

## Passed

Production build and TypeScript checks passed on 2026-09-15. The local preview returned HTTP 200. A separate local build folder was used after macOS cloud-only files blocked reads in the original Documents folder.

Automated tests cover the small-shop demo catalog, seller publishing and migration, flat-width/circumference conversion, negative ease, missing dimensions, elastic waist and adjustable cap deferral, slot replacement/removal, invalid sizes, body ranges, presets, storage normalization, finite garment geometry, fixed garment dimensions across body girths, ellipse math, photo postprocessing, manual input precedence, bad photo evidence, and WebMCP input validation.

On 2026-09-25, 68 automated tests, TypeScript checking, and a production build passed. A local D1 account workspace was saved through the authenticated seller API. The anonymous catalog endpoint returned only its ready, published store and product, without an account identifier. The shopper street then showed the server store, entered its seller-curated floor, exposed the placed product, price, stock, measurements and purchase link, and retained no horizontal overflow at a 390px viewport.

The MakeHuman GLB was checked for valid indices, buffers, finite coordinates and named morph targets. Neutral circumference sections were calibrated in asset generation. Garment thumbnail images are z-buffered renders of the same geometry used by the browser.

## Accuracy limits

No paired real-person measurements, garment patterns, fabric parameters, or physical try-on study were supplied. Automated tests establish software behavior only; they do not establish real-world body-measurement or fit accuracy. Every estimate is labelled unvalidated in the UI.

Photo geometry tests use synthetic silhouettes and known landmarks. End-to-end MediaPipe detection and real-person photos require separate acceptance testing; no actual accuracy score is claimed.

## Browser contract check

Both WebMCP tools registered with their expected schemas and read/write annotations. The live preview returned the eight products and current body/outfit. Equipping top 3777371 size L updated the read-back outfit and retained bottom 3504218 size 30. Invalid size input was rejected without changing the outfit; the original top was restored. Ordinary browser UI screenshots and click interactions were not used as a substitute.

## Privacy implementation

Photo files are held in component memory/object URLs and transferred as ImageBitmap objects to a local Web Worker. The Worker fetches only same-origin model/WASM assets, reads image pixels locally, and returns derived dimensions. Object URLs are revoked and the Worker is terminated on close. The only persistent value is the normalized BodyProfile. No analytics, image upload API or user-image server storage was added.
