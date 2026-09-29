# BAYTS Historical

Computes the historical Sentinel-1 statistics BAYTS Alerts monitors against: per orbit pass, the backscatter's mean
and standard deviation over a period, the relative orbit they came from, and speckle statistics.

## Inputs

`options.orbits` lists the orbit passes, `ASCENDING` and `DESCENDING`, in the order the model stores them. The other
`options` configure the radar collection each pass is built from - geometric correction, spatial and multitemporal
speckle filtering, outlier removal, masking - and `dates` bound it. The AOI is its one external reference.

## Output

Declared in `lib/js/shared/src/recipe/type/baytsHistorical.js` from the configuration alone (see the
[output-declaration migration](../design/recipes/data-sources.md#output-declaration-migration)): for each pass, in the
order the model stores them, `VV_mean`, `VV_std`, `VH_mean`, `VH_std`, `orbit`, `VV_speckle` and `VH_speckle`,
suffixed `_asc` or `_desc`. That is the order execution builds them in: each pass's radar time scan, then the speckle
statistics added to it. Every band is scalar and stored as computed, with no encoding. Coarser pyramid levels keep the
most common `orbit_*`, a relative orbit number, and average the rest. Earth Engine's default averaged every band, so
new exports - direct, through Masking and through Stack - change only at coarser levels, where orbits are no longer
averaged. Speckle filtering changes values, never bands: without multitemporal filtering the speckle bands are the
constant 1.

| Stated orbits | Answer |
| --- | --- |
| each pass once | its bands, as above |
| none, or an empty list | refused, `INCOMPLETE_IMAGE_OUTPUT` at `model.options.orbits` |
| not a list, or a value that is no pass | refused, `MALFORMED_IMAGE_OUTPUT` at the list or at that value |
| a pass twice | refused, `DUPLICATE_BAND_NAME` at the repetition |

Refusals are made before anything is read. The Earth Engine catalogue answers the declared bands, or refuses the same
orbits, without building anything.

An operation naming output bands (`outputBands`, as exports and Masking ask) gets exactly those, in the order named;
a band the image does not hold fails the request. Any other request - none, an empty selection, or a bare `selection`,
which is not a request for bands here - gets every declared band in declared order. Retrieve exports all bands, to
Earth Engine only.

BAYTS Alerts reads a historical recipe's statistics by name, per pass (`.*_asc`, `.*_desc`), and which recipe or asset
holds them through the separate `BAYTS_HISTORICAL_STATS` capability (`historicalStatsSource`); neither depends on this
declaration. It asks for no bands, so it reads the complete output: over a historical recipe whose pass supplied no
speckle statistics, BAYTS Alerts now fails for the missing band where it used to run without it.

## Open issues

- **A recipe of both passes holds one pass's statistics under both suffixes.** Each pass is built as a Radar Mosaic
  whose orbit is set in a top-level `options`, while the mosaic reads `model.options`, so both passes are built from
  the same imagery: in an area with both, the dominant orbit's, and in an area with one, that pass's. The suffixes name
  bands; they do not establish which pass the pixels came from. BAYTS Alerts then masks the other pass's monitoring
  observations against the wrong relative orbit. Only single-pass recipes are pass-correct. Its correction is the next
  scheduled packet ([priority correction](../design/recipes/data-sources.md#priority-correction-after-bayts-historical)).
- **Multitemporal filtering supplies no speckle statistics for a pass without imagery.** Its statistics collection
  holds none for that pass. A request for the complete output, or for those bands, is refused for the missing band;
  one needing none of them still runs. Nothing replaces the missing statistics.
- **A single pass without imagery fails with an unhelpful message** ("If one image has no bands, the other must also
  have no bands") rather than the radar mosaic's "all images have been filtered out".

## Verification

- `modules/gee/verify/baytsHistoricalOutputBands.mjs` - on live Earth Engine and real Sentinel-1 imagery: the catalogue
  and the image built for no request, an empty selection and a bare selection, per pass, for both passes either way
  round, and with speckle filtering off, QUEGAN and RABASAR; output bands out of order, directly and through Masking; an
  unbuilt band refused; a pass without imagery refused for its missing speckle statistics while a request needing none
  runs; each single pass's orbit among that pass's relative orbits. The wrong-pass defect is reproduced apart - both
  passes of a recipe of both equal a freshly built ascending-only recipe, and its descending pass differs from a freshly
  built descending-only one - and never counted as correctness.
- `lib/js/shared/test/recipe/output/type/baytsHistorical.test.js` - the declaration, its refusals, the capability BAYTS
  Alerts reads, and Masking and Stack over it.
- `modules/gee/test/jobs/ee/bayts/historicalOutputBands.node.test.mjs` - which bands a request returns, directly and
  through Masking, including a pass that supplied no speckle statistics.
- `modules/gee/test/jobs/ee/bayts/historicalBands.test.js` - the catalogue, whatever is asked.
- `modules/gui/src/app/home/body/process/recipe/modelDerivedOutput.test.js` - the common read, presentation, presets,
  Retrieve's order and policies, refused orbits, broken dependencies, and BAYTS Alerts over a historical recipe.
- `modules/gui/src/app/home/body/process/recipe/baytsHistorical/baytsHistoricalOutput.test.js` - Masking and Stack over
  it.
- `modules/task/src/tasks/imageAssetExport.test.js` - no encoding recorded, and refused orbits failing the export.
