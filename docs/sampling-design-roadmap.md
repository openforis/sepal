# Sampling Design Roadmap

Last updated: 2026-07-01

This is a working decision log for Sampling Design. It captures agreed behavior, pending implementation slices, and options we have discussed so the context does not depend on chat history.

## Current Direction

- Sampling Design preview should be an explicit feature layer source, not the normal "This Recipe" image layer.
- Sample generation logic should live in `lib/js/ee/src/samplingDesign`, shared by preview and export.
- Export remains the authoritative strict path. Preview may use cheaper approximations where documented, but it must not fetch sample features into browser memory.
- Systematic preview should avoid vectorizing large sample collections for map rendering. The current direction is raster preview for systematic samples and table/feature rendering only where it stays cheap.
- Random and systematic exports should carry enough metadata to reproduce and audit results: seed, arrangement strategy, sample-size strategy, CRS/transform, grid origin, selected density, selected level, and algorithm version.

## Implemented Foundation

- Shared sampling modules were moved into `lib/js/ee/src/samplingDesign`.
- Task exporters call the shared sampling logic and keep task-specific export orchestration in `modules/task`.
- The GUI preview endpoint is `POST /api/gee/samplingDesign/samplesMap`.
- The GUI layer must call `api.gee.samplingDesignSamplesMap$({recipe: toTaskRecipe(recipe)})`, not the raw editor recipe.
- GUI preview is gated by `validateRetrieve(recipe.model)` before creating/updating the map layer.
- Saved Sampling Design layers that referenced the old `this-recipe` image source are normalized to Google Satellite.
- Systematic sample preview now uses a raster path rather than styling a large vector collection.

## Systematic Design Decisions

- The systematic design is a nested systematic lattice.
- The base lattice is hexagonal/triangular. Some levels skip rows to reduce step size between achievable counts; those derived levels are still systematic but not strictly isotropic hex layouts.
- `gridOrigin: FIXED` preserves the historic global origin.
- `gridOrigin: SEEDED` uses a seed-only global phase so the same seed, CRS, transform, density, and strategy clip the same global lattice across AOIs.
- Exact subset guarantees across different AOI sizes require compatible selected density/level/strategy. A shared origin alone does not guarantee that a coarse design is a subset of a denser design.
- The arrangement CRS is the grid/distance CRS. Equal-area is recommended for balanced density by area, but ground-distance distortion remains projection-dependent.

## Density Search Behavior

Systematic density selection is expensive because each candidate density needs an Earth Engine count. The current strategy:

- Build a slack-adjusted base density using `BASE_GRID_SLACK`.
- Evaluate candidate density offsets against selected-level summaries rather than full filtered feature collections.
- Use `maxRetries=0` for exploratory density count calls.
- Keep best-effort behavior: if a later exploratory count fails and a valid best density exists, use the best; if no valid best exists, fail clearly.
- For `CLOSEST`, stop early when a later density improves by less than the configured threshold.

Pending refinement:

- For `CLOSEST`, stop immediately when a later accepted density is equal or worse than the current best.
- Consider evidence-based jumps over offsets only when the current density is clearly too sparse.

Proposed jump heuristic:

```text
ratio = requested / max(actual, 1)
jump = ceil(log4(ratio))
jump = clamp(jump, 1, remainingOffsets)
```

Use the maximum relevant stratum ratio, and only jump when one of these is true:

- A required stratum is empty.
- A stratum is far below target, for example `actual < requested * 0.5`.
- The `CLOSEST` score is dominated by under-count rather than over-count.

Do not jump aggressively for `OVER` until we have more runtime evidence. `OVER` is optimizing smallest oversample, and skipped offsets may hide the best surplus.

## Preview Roadmap

Short term:

- Confirm systematic raster preview returns promptly on large designs.
- Confirm systematic preview dots align with exported sample locations for `CLOSEST`, `OVER`, and `EXACT`.
- Confirm random preview remains cheap enough on realistic designs.
- Keep `modules/gee/config/log.json` debug/trace changes out of commits unless intentionally needed.

Known caveat:

- Systematic `EXACT` raster preview cannot represent the seeded random thinning step exactly unless it vectorizes or materializes the final thinned table. It may show the selected level set, which is a superset of the exact export.

Options if raster preview is not practical:

- Materialize preview samples to a temporary table asset and render that.
- Use a table asset or FeatureView style workflow for long-lived preview/cache behavior.
- Cache the selected density/level metadata in the recipe model so repeated preview/export can skip density search when relevant inputs are unchanged.

## Export Roadmap

- Keep final export validation strict.
- For systematic export, continue to materialize only the selected unfiltered sample density to a temporary EE table asset, then filter to the final samples.
- For SEPAL table export, continue using table export/download rather than fetching rows into the client.
- Include analysis weights and reproduction metadata in both GEE asset and SEPAL exports.

Potential optimization:

- Persist selected density decisions in the recipe, keyed by all inputs that affect them: AOI, stratification image/source/band, allocation rows, arrangement strategy, sample-size strategy, min distance, scale, CRS, CRS transform, grid origin, seed where relevant, and algorithm version.
- Invalidate this cached density selection whenever any key input changes.
- Treat cached density as an optimization only. Export should still be able to recompute if cache is missing or incompatible.

## Proportions Roadmap

- Probability-image anticipated proportions are supported.
- Categorical anticipated proportions are supported by computing the fraction of sampled pixels/cells equal to a target class.
- Class discovery should prefer recipe/asset legend metadata when available.
- If no legend metadata exists, allow user-triggered distinct-value discovery with a numeric fallback.
- The target-class selector should show class colors when metadata includes colors.

Potential refactor:

- `proportions.jsx` is large and fragile around dependent fields.
- A future refactor can extract controls/state helpers mechanically, but broad dependency-nullification machinery was not clearly simpler in the first attempt.

## Open Questions

- Should selected density/level decisions be persisted automatically after preview, export, or only after a successful explicit "Apply" style action?
- Should preview failures surface as map-layer errors in the GUI, notifications, or both?
- Should multi-stratum `CLOSEST` fail when one stratum is empty, or allow partial output when the whole collection is non-empty?
- Should the GUI expose a warning when `EXACT` preview is a superset rather than the exact thinned export?
