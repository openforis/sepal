# Change Alerts

Monitors a CCDC reference against newly acquired observations over a monitoring period, calibrated on the period before
it, and flags changes from the fitted segments. Its map shows the changes, or instead the collection mosaic a period
is compared on.

## Inputs

`reference` is the CCDC segments: a CCDC recipe, a recipe that preserves its segments such as a Masking over one, or a
segments asset. `date` states the period: `monitoringEnd` (YYYY-MM-DD), a `monitoringDuration` in
`monitoringDurationUnit` before it, and a `calibrationDuration` in `calibrationDurationUnit` before the monitoring
start. The form offers days, weeks and months, and keeps a duration as the digits its number input holds. Each
duration must be at least one: a window that does not last has no day to compare, so Dates refuses it, and a period
saved so (`NON_POSITIVE_DURATION`, at that duration) holds the changes and every collection mosaic, marking Dates. The
chart's observations are read over whatever days the period holds.
`sources` - `dataSetType` (`OPTICAL`, `RADAR` or `PLANET`), `dataSets`, `assets` and `band` - and `options` are the
collection monitored against. Monitoring choices belong to Change Alerts. The first Reference Apply during genuinely
new creation seeds editable defaults once; later producer edits, replacement, Refresh and reopen never overwrite them.
The data sets the reference prefers are not seeded as configuration: Sources propose them as they first open, as far as
the calibration and monitoring years let them contribute ([initial data sets](../design/recipes/data-sources.md#initial-data-sets)).
Where its metadata records none, they follow the monitoring type it records, or else the measures its segments were
fitted for: a radar-only reference proposes Sentinel-1.
Required processing matches are derived read-only from the current producer or recorded asset metadata; genuinely
unrecorded asset settings remain explicit consumer fallbacks. Displaying those values does not rewrite saved copies
or editable drafts ([source evidence](../design/recipes/gui-source-runtime.md)). `changeAlertsOptions` configure the
algorithm. No separate "Use reference settings" copy-again action is planned.

Its data sets are judged as the shared [data-set availability](../design/recipes/data-sources.md#data-set-availability)
describes, for each window its changes compare (`dataSetWindows`): calibration, from its start until the monitoring
start, and monitoring, until the monitoring end, both excluded. One of the chosen data sets must be able to cover some
day of each, any one of them: Landsat 4-5 for a calibration before May 2012 and Landsat 8 for a monitoring after March
2013 together suffice, and part of a window suffices. Between those days neither does, whatever their years: a
calibration from September to November 2012 and a monitoring of December and January need Landsat 7. Where a window is
left uncovered, the changes - their layer, Retrieve and export - and every collection mosaic are held, before any
preview is requested, and SRC names each such window, by its days unless it is whole calendar years. Its chart's
observations are read over the whole period at once and are held only where no chosen data set may cover any of it; the
reference's segments are not held for either. Sources offer anew whatever may cover some window. All of this is judged
under the correction the reference's processing makes effective, which the imagery is read with, never the one the
recipe's options saved: Landsat 4-5 saved top of atmosphere over segments recording SR covers early 2012, and saved with
SR over segments recording top of atmosphere does not. Its readiness judges it, reading that processing from the
reference's description - what a computing CCDC is configured with, or what a segments asset records - so a recipe
built on the changes, such as a Masking of them, is held by it too, naming Change Alerts, and so is its export. Where
the correction decides, nothing is decided while the reference is read: what needs it waits, and Sources and a new
recipe's proposal leave out only what neither correction allows ([data-set availability](../design/recipes/data-sources.md#data-set-availability)).

Change Alerts monitors a band its imagery observes itself, and uses no Classification.
- **Not proposed from the producer.** The producer's `classification` and `breakpointBands` are not proposed; ones an
  older recipe saved stay stored.
- **No dependency.** They are no dependency: Change Alerts needs no access to a Classification a shared segments
  asset's `recipe_sources` name. A referenced recipe's own dependencies still count, since building its segments may
  need them.
- **Not run.** Execution builds the monitoring collection without one.
- **A classified band is refused.** A saved monitored band a Classification computes (`regression`,
  `probability_<value>`) is refused as `CLASSIFIED_MONITORED_BAND` (`lib/js/shared/src/recipe/type/changeAlerts.js`)
  and by execution, and stays shown as chosen. SRC says on the band that Change Alerts cannot monitor it, and choosing
  a band of the imagery repairs it.
- **Server boundary.** The chart sends the applied Change Alerts recipe. The server reads reference processing,
  requires the live referenced computation to be usable, judges the configured native monitoring band, and then
  derives the observed Time Series collection without a copied consumer Classification. These checks precede pixel
  sampling or collection construction. Settings-only acquisition does not build segments or train anything.

REF says one thing at a time on the selected asset or recipe: a refusal is its error, in one sentence - an asset
without CCDC segment time bands "can't be used as a CCDC segment reference", one with a malformed layout named by a
few of its problems - and only once the reference is usable does a warning say what the segment chart cannot plot.
A usable reference that the monitoring settings do not fit is applied without a warning in REF: SRC is marked, says on
the setting to change why - the type of data, the data sets or the band monitored - and holds the alerts back until it
is repaired. The full findings stay in the requirement read; the field shows its summary
([source resolution](../design/recipes/source-resolution.md#change-alerts-ref)).

### Monitoring choices and chart availability

SRC, Retrieve and the analysis chart use the existing shared `MONITORED_MEASURE` rule against current reference facts
and effective processing. The native monitoring scope is shared by the GUI and server, with the existing optical,
radar and temporal Planet choices retained. An unusable configured band cannot be bypassed by exploring another band
in the chart. Missing native and classified selections remain visibly selected with standard field feedback when SRC
opens; opening does not edit the saved model. Explicit draft repair follows the chosen family, datasets and band.
Apply commits the repair; Cancel preserves the applied configuration and its holds. Restoring and refreshing the
reference can also clear the finding without editing SRC.

Confirmed incompatibility disables Retrieve and the chart action, closes an open chart and cancels both streams.
Repair makes the action available without automatically reopening the chart. Pending/failed reads do not invent a
configuration error. The chart watches its segment and observation operations, rather than full alerts-image
readiness: an unrelated image-only/export problem does not become a chart hold. Genuine reference failures remain
in REF, while SRC explains monitoring choices that SRC can repair.

The alert-image construction used by previews and asset exports also judges the configured band with the same rule
before building segments or monitoring observations. Its known output description stays available. A period mosaic
does not acquire a monitoring-band requirement it does not use. `/ccdc/loadSegments` receives the source reference
alone, so it can judge the producer but cannot judge the consumer's monitoring choices; the GUI holds/cancels both
streams and the Change Alerts observations request enforces those choices. This does not close the separately
recorded broader preview-server readiness gap.

Manual check: start with optical CCDC and Change Alerts monitoring `nbr`, and obtain a chart response. Change CCDC
to a valid radar configuration including radar breakpoint bands. SRC must remain on its saved optical/`nbr` choice,
explain the mismatch and hold Retrieve/charting, closing the old chart. In SRC, choose radar/`VV`: Cancel must retain
the error; Apply must clear it and allow a new chart with actual segments and observations. Alternatively restore the
producer's optical configuration and verify recovery without changing SRC. No automatic data-family or band repair
is performed on an upstream edit.

The dates of the period are computed once, by `monitoringDates` (`lib/js/shared/src/recipe/changeAlerts/`), for both
execution and the GUI: the monitoring start is the end less its duration, and the calibration start the monitoring
start less its own. A month back keeps the day, or the last day of a shorter month; a year is twelve months. Dates
are proleptic Gregorian in the year stated, 0000 to 9999; a period reaching a date YYYY-MM-DD cannot state is refused.
`periodDates` answers the same dates, or the field that keeps them from being computed, for a consumer that must
withhold rather than fail; `monitoringDates` fails with that reason.

## Output

The changes are its canonical output, declared in `lib/js/shared/src/recipe/type/changeAlerts.js` (see the
[output contract](../design/recipes/output-products.md#declaration-and-description)): nine scalar bands,
sampled, with no encoding, known before a period or a reference is chosen. Retrieve, Masking and Task read only these.
Their styles span the period, so a recipe whose period cannot be computed is described alike but offered none, and its
layer selects nothing until the period is corrected.

### Collection mosaic

A layer can show the `COLLECTION_MOSAIC` map product instead, with `{period: 'monitoring' | 'calibration', mosaicType:
'latest' | 'median'}`. Both are required, as written; anything else, and any other parameter, is refused. It is
never an export authority.

It is the mosaic `mosaicRecipe` (`lib/js/shared/src/recipe/changeAlerts/mosaicRecipe.js`) builds from Change Alerts'
own `sources` and period, and effective processing options, and it is described by delegating to that mosaic type's declaration: Optical,
Radar or Planet Mosaic, as `sources.dataSetType` says. Execution builds the same recipe, clipped to the geometry of the
selected reference - a wrapper's own, not the CCDC's under it. Describing it reads no reference, resolves no geometry
and builds no imagery.

| Data-set type | Mosaic | Monitoring / calibration | latest / median |
| --- | --- | --- | --- |
| `OPTICAL` | Optical Mosaic of all scenes, `sources` as saved, `options` as composite options, composed by median | target at the end / the monitoring start; season the monitoring / calibration period | day-of-year percentile filter 100 / 0 |
| `RADAR` | Radar Mosaic with `options` | target at the end / the monitoring start, or a scan of the monitoring / calibration period | a point in time / a time scan: a different schema |
| `PLANET` | Planet Mosaic of the first `dataSets.PLANET` source and `assets`, with `options` | the monitoring / calibration period | a target date at the end or the monitoring start / none |

Its bands, their order, shapes, encodings and pyramiding policies are that declaration's. An optical mosaic holds no
date bands, since it is composed by median.

A mosaic is built from the complete period whatever it covers, so all five date fields are required: a missing one is
refused as `INCOMPLETE_IMAGE_OUTPUT` and one the form could not have written - not a calendar date, a fraction or a
word, a unit other than days, weeks or months - as `MALFORMED_IMAGE_OUTPUT`, at its `model.date` path, as is a
duration reaching a date YYYY-MM-DD cannot state. `sources.dataSetType` must be one of the three, at
`model.sources.dataSetType`, and a Planet mosaic needs `dataSets.PLANET` to be a list whose first entry is `NICFI`,
`BASEMAPS` or `DAILY`, at `model.sources.dataSets.PLANET`. Refusals of the period and the sources are reported
together. The changes are described whatever these state.

Every mosaic is held to what holds the changes of Change Alerts' own configuration and Sources, though it covers one
window and monitors no band: a window that does not last, data sets leaving a window uncovered, a monitored band a
Classification computes (`CLASSIFIED_MONITORED_BAND`), and a measure monitored that the reference's segments lack or
the data do not observe, said in SRC. The layout the alerts slice does not hold it: a mosaic slices no segments, and
needs only the provider chain whose geometry it is clipped to.

The layer presents each mosaic's bands - cursor precision and ranges - as its own recipe type does. Its styles are
built from the same projection, and a mosaic its read does not describe offers none, so a saved recipe with a broken
period or source leaves the layer form usable, previews nothing, and offers the mosaic again once corrected. On the
wire the layer sends `visualizationType` and `mosaicType`, which every image request of the layer - preview, histogram
and distinct values - carries alike. Changing the view or the style acquires nothing again; a record the layer depends
on changing does.

Known limitations and follow-ups are tracked in the [workplan](../design/workplan.md#change-alerts).

## Verification

- `modules/gee/verify/changeAlertsCollectionMosaic.mjs` - on live Earth Engine, for every view of optical and radar
  recipes, and over a Masking of an optical CCDC: the shared description, the catalogue and the image built for the
  described bands hold the same scalar bands. A latest radar mosaic's sample, at the monitoring end and the monitoring
  start, names an acquisition listed independently from the scene catalogue by its zero-based day of year and whole
  days from the target, with its orbit, and none lies nearer. Planet is catalogued; building it is reported as
  blocked, as is a segments asset reference: neither is accessible to the service account.
- `modules/gee/verify/changeAlertsOutputBands.mjs` - the changes' schema.
- `lib/js/shared/test/recipe/output/type/changeAlerts.test.js` - the product's description, identity and parameters;
  the recipe each view is delegated as, at both boundaries, in weeks, days and years below 100; following Change
  Alerts' saved model over a CCDC configured otherwise; the refusals; the changes unaffected; the monitored band and
  windows that do not last holding the mosaics.
- `lib/js/shared/test/recipe/dataSetAvailability.test.js` - the windows judged by readiness for the changes and the
  mosaics, by days and under the correction the reference's description establishes, between Landsat 4-5's last
  acquisition and Landsat 8's first included; waiting for the reference only where its correction decides; a Masking
  of the changes held with Change Alerts in the path; and the whole period for the chart's observations.
- `modules/gui/src/app/home/body/process/recipe/changeAlerts/collectionMosaicLayer.test.jsx` - every layer mode
  withdrawn while a window is uncovered under the CCDC's correction, whatever the alerts saved, and drawn again once
  Sources or Dates repair it; a layer of a Masking of alerts that are not open, withdrawn and drawn again alike.
- `modules/gee/test/jobs/task/export/imageAssetExport.test.js` - the export of the changes, and of a Masking of them,
  refused before anything is built where a window is uncovered under the correction the segments record, and exported
  where it is covered.
- `modules/gui/src/app/home/body/process/recipe/changeAlerts/referenceRequirement.test.jsx` - the data sets judged
  under the correction the reference records, not the one saved: Sources marked and their draft refused, the changes,
  mosaics and chart held or released, choices offered and proposals made by it, and nothing decided while it is read.
- `modules/gui/src/app/home/body/process/recipe/changeAlerts/referenceRequirement.test.jsx` - the mosaics held for a
  measure the segments lack, not for their layout; Dates refusing a window that does not last, and marking one saved.
- `lib/js/shared/src/recipe/changeAlerts/monitoringDates.test.js` and `mosaicRecipe.test.js` - the dates of the
  period, the field that keeps one from being computed, and each source type's projection.
- `modules/gee/test/jobs/ee/timeSeries/changeAlertsCollectionMosaic.test.js` - each view executed as described, over the
  selected reference's geometry, a Masking wrapper's and a segments asset's included.
- `modules/gui/src/app/home/body/process/recipe/outputs/modelDerivedOutput.test.js` - each view described, presented and styled,
  and refused without a period or a Planet collection.
- `modules/gui/src/app/home/body/process/recipe/changeAlerts/changeAlertsImageLayer.test.js` - the layer form over a
  broken period or Planet source, and over a period that cannot be computed - before year 0, a duration that is no
  number, a unit it cannot count - switching modes without failing, and recovering in either mode once corrected.
- `modules/gui/src/app/home/body/process/recipe/map/recipeImageLayer.test.js` - preview arguments, a view change and a
  restyle acquiring nothing, and a record change acquiring again.

Focused GUI/server tests also cover retained native selections, draft Enter/direct submission, Cancel,
Optical-to-Radar producer changes, asset refresh recovery, both-stream cancellation and refusal before
computation. Controlled EE boundaries establish gating, not live pixels; browser acceptance requires actual
segments/observations after repair.
