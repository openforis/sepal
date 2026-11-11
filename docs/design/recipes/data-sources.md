# Recipe data sources: architecture

Current shared recipe architecture and its technical design index. All backlog items, delivery slices
and research questions are maintained in the [SEPAL workplan](../workplan.md).

## Design documents

| Document | Responsibility |
| --- | --- |
| [Behavior contracts](behavior-contracts.md) | Ownership, operation validity, editing, feedback, repair and asynchronous lifetime. |
| [Output products](output-products.md) | Canonical/named products, physical bands, export requirements, encoding and target source composition. |
| [Source resolution](source-resolution.md) | Dependency graph, authorization, readiness, provider identity and target execution bundles/provenance. |
| [GUI source runtime](gui-source-runtime.md) | Pure reads, shared acquisition, candidates, watches and recipe-scoped interaction. |
| [Source freshness](source-freshness.md) | Live currency, revisions, assets and target persisted-result evidence. |
| [Visualizations](visualizations.md) | Presets, local styles, draft Copy/Paste, applicability and target transformation templates. |
| [Mask and Fill](mask.md) | Current Apply mask contract and proposed Fill modes. |

Individual recipe behavior and local limitations belong in [recipe developer notes](../../recipes/README.md).
User documentation belongs in the separate `sepal-doc` repository. Keep a rule at its owner and link to it rather
than restating it in each consumer.

## Current architecture

All image-producing types declare `IMAGE_OUTPUT`; Sampling Design declares `NO_IMAGE_OUTPUT`. Shared registration
rejects an undeclared image/no-image contract. Canonical output, named map products, physical schema, GUI decoration
and capability requirements are distinct. Map and Retrieve consume one common read rather than per-type band
availability helpers. [Output declarations](output-products.md#declaration-and-description) describe this contract.

The source runtime owns asynchronous work and evidence. Shared pure requirements produce located findings;
type/GUI declarations apply them to operations and repair fields. Description availability, structural dependency
validity, readiness and evidence currency remain separate. Source facts do not overwrite editable choices.

References retain selected outer execution identity while capability providers supply interpretation. Browser
preflight uses authenticated closure loading. Server operations retain one authorized record per recipe ID and
preserve each subscriber's context. Neither path supplies a graph-wide coherent execution bundle today.

Recipe-owned modal panels inherit scope centrally. Recipe selectors and known recipe names in shared validation
feedback use the same open-or-focus action, preserving existing drafts. The interaction contracts are in
[the GUI runtime](gui-source-runtime.md#recipe-scoped-panels-and-navigation).

### Band encoding

Encoding is a per-band fact (`physical = stored * scale + offset`), separate from pixel size and measurement
compatibility. The [output contract](output-products.md#band-encoding) owns its persisted asset format, bounds,
reader and export-authority rules.

### Data-set availability

Sources of a date-filtered collection judge their data sets against the days the recipe's execution reads, one policy
for every such recipe (`lib/js/shared/src/recipe/dataSetAvailability.js`). A data set may hold imagery on the days of
the collections execution reads for it under the recipe's correction, SR or TOA (`dataSetSpecs[reflectance]`; Landsat 4-5
as Landsat 4 and 5, Tier 2 as its own collections). Each collection's days run from its first acquisition day to its
last, both included, as the Earth Engine catalogue states them (`optical/collectionDates.js`, `radar/collectionDates.js`);
a collection still acquiring has no last day. These are the collections' dates, not their missions': Landsat 5's top of
atmosphere Tier 1 ends on 8 November 2011 and its surface reflectance on 5 May 2012, Landsat 7's collections end on 19
January 2024, and Sentinel-2's surface reflectance begins on 28 March 2017, its top of atmosphere on 27 June 2015.
Possible imagery only, not scenes over the AOI, cloud-free ones or enough observations. A data set the catalogue gives no
days, a Planet source, and a period not fully stated, judge nothing.

Each type exports `dataSetPeriod(model)`: the days its execution reads, `[startDate, endDate)` with the end excluded, the
years they fall in, and the correction its options select (`reflectance`), or null while that is not known, when a data
set is excluded only where neither correction's collections may hold imagery. A type stating years reads their complete
calendar years. It declares `dataSetPeriodRequirement` (`NO_PERIOD_OVERLAP` at `sources.dataSets`, naming the period's
days and years) for the operations reading that imagery. A type comparing periods also exports `dataSetWindows(model)`,
`[{window, ...period}]`, and declares `dataSetWindowsRequirement` for the operations comparing them: each window needs a
chosen data set that may cover some day of it, any one of them, and one finding of the same code names every window left
uncovered (`windows`). A layer showing a type's auxiliary mosaic beside its result is held for the same requirements,
whatever part of the period it shows:

| Type | Days read | Held when no chosen data set may contribute |
| --- | --- | --- |
| Optical Mosaic | From its season's start `yearsBefore` before to its end `yearsAfter` after, under its composite's correction | Image, with all scenes. Selected scenes are composited by id, whatever the dates. |
| CCDC | `startDate` until `endDate`, excluded | Image, pixel observations, pixel segments, count |
| Time Series | `startDate` until `endDate`, excluded | Image (and its download), pixel observations |
| Phenology | The calendar years `fromYear` to `toYear` | Image |
| LandTrendr | The calendar years `startYear` to `endYear` | Image, and the annual mosaic whatever year it shows. |
| Change Alerts | Calibration start until monitoring end, excluded (`periodDates`); each of calibration and monitoring | Each window: image and every collection mosaic. The whole period: pixel observations. The reference's segments are not. |
| PyEO Alerts | `monitoringStart` until `monitoringEnd`, excluded, as a classification's proposal would save them | Image. The baseline is the Classification's image. |

An Optical Mosaic reads its season in each of those years; the days from the first season to the last judge a data set
as those seasons do, as none holds imagery for less than the year between two of them.

Change Alerts reads its imagery under the correction its reference's processing makes effective
(`effectiveSettings`, `changeAlerts/processing.js`), not the one its options saved. Its readiness judges its windows,
and for pixel observations the whole period, under that correction (`coveredAsRead`, `type/changeAlerts.js`), as any
configuration requirement is judged:

- **Where the processing comes from.** The reference's description establishes it, as evidence (`evidencedProcessing`).
  A computing CCDC states the processing its configuration selects (`processingEvidence`). A segments asset is observed
  with the properties it records its processing in, read beside its bands in one evaluation (`assetObservation$`,
  `lib/js/ee/src/bandEvidence.js`; the GUI asks `/bands` for them with `includeProperties`), and keeps them as evidence
  of its description (`recordedProperties`, `output/imageOutput.js`). Masking, an asset mosaic or whatever else
  preserves its input's evidence passes it on. An asset recording nothing leaves the saved correction to decide, as
  `effectiveSettings` does.
- **What waits.** Where SR and TOA find the same, that is the verdict, and nothing more is read. Otherwise the
  requirement asks for the reference's description, which is what acquires it: until it is held, readiness is
  NEEDS_EVIDENCE, never READY, and nothing is found. Processing that cannot be read finds nothing here;
  `CHANGE_ALERTS_PROCESSING` refuses it.
- **Who is held.** The finding keeps its code and location (`NO_PERIOD_OVERLAP` at `sources.dataSets`, with the
  windows or period). Any recipe whose image is these changes reaches it as its readiness walks what it builds - a
  Masking of them, say - with Change Alerts in the finding's `recipePath`. So the GUI's gates for the changes, their
  mosaics, the chart and a layer of anything built on them hold, Sources are marked and a Sources draft refused
  through the type's ordinary binding (`dataSetPeriodRequirement`), and every export refuses before anything is built.

Sources and a new recipe's proposal judge choices under the same effective correction, read from the reference's
processing as the Sources panel holds it (`effectiveReflectanceOf`); while that is read, a data set is left out only
where neither correction may cover the period.

Retained data sets still narrow the bands, as execution intersects every chosen data set's bands before it filters
scenes by date (`lib/js/ee/src/optical/collection.js`).

In Sources (`dataSetOptions`, `modules/gui/src/sources.js`), a data set that period excludes cannot be chosen anew. One
the draft chooses - a saved recipe's choice included, as it opens - stays chosen and can be removed, its tooltip saying
when it holds imagery. Removed, it cannot be chosen again, even while the applied recipe still holds it, until dates it
may cover offer it again. No Dates Apply removes data sets, and no render prunes them. A selection some of which may
contribute is neither marked nor held, so a functioning recipe keeping data sets older defaults chose stays as it was. A
collection type chosen anew starts with its first data set that may contribute, or none. `NO_PERIOD_OVERLAP` is said
beside the data sets and on the Sources toolbar button (`dataSetPeriodRequirement.js`) only where none chosen may
contribute, and a Sources draft leaving none able to cannot be applied, by Apply, Enter or a wizard step. A Dates Apply
is not refused: it marks Sources until Sources or Dates repair them. A windowed finding names each window uncovered in
its type's words (`windowLabel`). Choices offered anew follow the type's whole period, so a data set that may cover any
window can be chosen.

Messages name a period of whole calendar years by its years (`format.yearRange`: "2012", "2012–2015") and any other by
its days (`format.dateRange`, the last the day before its end: "the calibration period (01 Sep 2012 – 30 Nov 2012)"). A
kept data set's tooltip names its years where the period lies in years it holds no imagery for ("Imagery from 2021.",
"Imagery for 1982–2012."), and its days where the period reaches into the year its imagery begins or ends, which its
years would not explain ("Imagery for 22 Aug 1982 – 05 May 2012.").

The same days judge which data sets a classifier-input finding (`UNSUPPLIED_CLASSIFIER_INPUTS`, CCDC, Time Series,
Phenology and PyEO Alerts) names as a repair (`unsuppliedClassifierFeatures`, `classifierInputs.js`): only data sets
that can be chosen anew, one the period excludes being named as unavailable, with the period
([Time Series](../../recipes/time-series.md#inputs)). A repair turning to the other correction is judged under it: the
chosen data sets repair it only where one may hold imagery then, and data sets to choose instead are those that may. A
dates change can move such a finding between the data sets and the classification.

#### Initial data sets

A new recipe's Sources start from the data sets its type prefers, declared on its GUI registration beside its default
model (`initialSources`: Optical Mosaic Landsat 9 and 8, Phenology Landsat 8, CCDC, Time Series and LandTrendr Landsat 9
to 4-5, Change Alerts those and Sentinel-2). As the set-up wizard first opens Sources, the shared initialization
(`initialSectionModel`, `modules/gui/src/app/home/body/process/recipe/collections/initialSources.js`, from `recipeFormPanel`'s
initial values) resolves them against the years the type's `dataSetPeriod` reads over the dates committed by then:
those that may contribute, else the first of their collection type that may (`initialDataSets`, the family-change
default), else none, for the user to choose. The draft starts from that proposal: opening commits nothing, an edit or a
deliberately emptied field is never defaulted again, and Apply or a wizard step committing Sources (Next, Done, or Back
from a valid draft) makes it the recipe's. A recipe being set up holds no data sets until then; once it does, later dates
keep them, the wizard still running. A recipe already set up - loaded, imported or copied - opens as held, missing data
sets included, so nothing compares a model with a preset.

Proposals of their own keep their owners. Change Alerts' first Reference Apply seeds the reference's monitoring defaults
and captures the data sets it prefers (`referenceDataSets`, kept as `ui.seededDataSets`) as those Sources prefer,
resolved against its calibration and monitoring years: the data sets its processing records; else those of the
monitoring type it records; else those of the first type whose data observe a measure its segments were fitted for,
optical before radar - Sentinel-1 for a radar-only reference. A reference replacing one applied seeds nothing. PyEO's Sources precede its Dates: a classification proposes data sets, dates and
processing together, and the data sets are offered, proposed (`initialDataSets`) and judged by the years the proposed
dates monitor. Data sets the user chose are kept and refused where those years leave none able to contribute. Each panel's
candidates judge the recipe its submission would save, its `additionalUpdates` included (`formSubmission.js`).

The rule, each type's period and its held operations are tested in `lib/js/shared/test/recipe/dataSetAvailability.test.js`;
the seven Sources panels, through their real forms and store, in
`modules/gui/src/app/home/body/process/recipe/collections/dataSetAvailability.test.jsx`; initial data sets through the real wizard,
default models and each type's own root and toolbar in `initialSources.test.jsx`; and PyEO's proposals in
`pyeoAlerts/panels/sources/sourcesProposal.test.jsx`.
