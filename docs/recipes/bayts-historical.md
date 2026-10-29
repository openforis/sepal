# BAYTS Historical

Computes the historical Sentinel-1 statistics BAYTS Alerts monitors against: per orbit pass, the backscatter's mean
and standard deviation over a period, the relative orbit they came from, and speckle statistics.

## Inputs

`options.orbits` lists the orbit passes, `ASCENDING` and `DESCENDING`, in the order the model stores them. The other
`options` configure the radar collection each pass is built from - geometric correction, spatial and multitemporal
speckle filtering, outlier removal, masking - and `dates` bound it. The AOI is its one external reference.

## Output

Declared in `lib/js/shared/src/recipe/type/baytsHistorical.js` from the configuration alone (see the
[output contract](../design/recipes/output-products.md#declaration-and-description)): for each pass, in the
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

## Passes

Each pass is built as a Radar Mosaic of the recipe with that pass alone as `model.options.orbits`, so its statistics,
its `orbit` band and its multitemporal speckle statistics come from that pass's imagery only.

Whether a pass has imagery is decided by its scenes: those execution's radar collection selects over the AOI in the
period, before any processing. A configured pass without scenes keeps its seven bands, fully masked and clipped to
the AOI; nothing is borrowed from the other pass and no value is substituted. A history none of whose configured
passes has scenes is refused as having no images (`process.mosaic.error.noImages`), whatever is asked of it; asked
only for a pass without scenes, a history whose other pass has scenes returns those bands masked. A pass with scenes
whose processing leaves a pixel without a valid value - too few observations, say - has that pixel masked, as
before. Multitemporal speckle statistics find a pass's relative orbits over its whole archive, so a pass without
scenes in the period may still have them; they are not what decides.

BAYTS Alerts reads a historical recipe's statistics by name, per pass (`.*_asc`, `.*_desc`), and which recipe or asset
holds them through the separate `BAYTS_HISTORICAL_STATS` capability (`historicalStatsSource`); neither depends on this
declaration. It asks for no bands, so it reads the complete output. A monitoring observation whose relative orbit
differs from its pass's historical `orbit` is masked, so over a masked pass every observation of that pass is excluded
and the alerts are those of the other pass alone; the alerts keep the pixels where any historical band is valid.

### Recomputed results

Histories computed from now on, and alerts computed over a historical recipe, can differ from earlier results for
the same recipe. Before, every pass of a recipe of both was built from the imagery of both. In an area with both
passes, with `orbitNumbers: 'DOMINANT'`, each suffix held the dominant orbit's statistics, and alerts masked the
other pass's observations against that orbit - in effect monitoring one pass; with `ALL`, each suffix held
statistics mixing both passes. Now each pass holds its own statistics and both passes are monitored.
In an area with one pass, the other pass's bands used to repeat the available pass's statistics; they are now
masked. Alerts there are unchanged where the monitoring period also has no observations of the missing pass. A pass
absent during the history can be acquired later; its observations are then excluded from the alerts.

Exported historical assets and alert assets are not rewritten, and alerts over a historical asset keep reading its
statistics. Recovering from earlier results is one of two choices. Recomputing the history, and restarting the
alerts from it, gives results consistent with the corrected statistics. Continuing earlier alerts
(`previousAlertsAsset`) over a recomputed history keeps the flags already raised from the earlier statistics, while
the new monitoring observations are tested against the corrected ones.

## Verification

- `lib/js/shared/test/recipe/output/type/baytsHistorical.test.js`: declaration, orbit refusals and inherited facts.
- `modules/gee/test/jobs/ee/bayts/`: catalogue, requested output and per-pass construction; server export tests
  cover metadata/refusal in `jobs/task/export/imageAssetExport.test.js`.
- `modules/gui/src/app/home/body/process/recipe/baytsHistorical/` and `recipe/modelDerivedOutput.test.js`:
  common reads, Retrieve, wrappers and broken dependencies.
- [Historical live probe](../../modules/gee/verify/README.md): per-pass statistics, missing-pass masks and
  refusals, filtering variants and downstream alert equivalence with valid comparison pixels.
