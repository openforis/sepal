# Sampling Design Roadmap

Last updated: 2026-07-03

This is a working decision log for Sampling Design. It captures agreed behavior, deferred implementation slices, and options we have discussed so the context does not depend on chat history.

## Current Direction

- Sampling Design has no normal "This Recipe" image layer and no live procedural sample preview.
- Sample generation logic lives in `lib/js/ee/src/samplingDesign`, shared by export and any backend sampling utilities.
- Export/retrieve remains the authoritative path for exact sample points. Users inspect sample locations by rendering materialized EE table assets as generic feature overlays.
- Random and systematic exports should carry enough metadata to reproduce and audit results: seed, arrangement strategy, sample-size strategy, CRS/transform, grid origin, selected density, selected level, and algorithm version.

## Implemented Foundation

- Shared sampling modules were moved into `lib/js/ee/src/samplingDesign`.
- Task exporters call the shared sampling logic and keep task-specific export orchestration in `modules/task`.
- Sampling Design recipes use `skipThis: true` and `defaultGoogleSatellite: true`.
- Saved Sampling Design layers that referenced the old `this-recipe` image source are normalized to Google Satellite.
- Exported EE table assets can be added manually through the generic "Add Earth Engine asset" flow and rendered as `EETableAsset` overlays.

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
- For `CLOSEST`, stop early when a later accepted density is equal/worse than the current best, or when it improves by less than the configured threshold.

Potential optimization:

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

## Visualization Direction

- Do not expose procedural sample preview in the GUI.
- Do not fetch generated sample features into browser memory.
- Use materialized EE table assets for map inspection. This avoids per-tile recomputation of the sampling graph and matches the export result.
- Until automatic add-on-success exists, users can manually add exported EE table assets through the generic feature overlay flow.

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

- Should selected density/level decisions be persisted automatically after export, or only after a successful explicit "Apply" style action?
- Should multi-stratum `CLOSEST` fail when one stratum is empty, or allow partial output when the whole collection is non-empty?
