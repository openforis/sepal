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

Sources of a date-filtered collection judge their data sets against the years the recipe's execution reads, one policy
for every such recipe (`lib/js/shared/src/recipe/dataSetAvailability.js`). The catalogue gives each data set's years
(`optical/dataSetYears.js`, `radar/dataSetYears.js`; Sentinel-1 from 2014, its collection beginning in October 2014). A
year in range establishes possible imagery, not scenes, coverage or enough observations. A data set the catalogue gives
no years, a Planet source, and a period not fully stated, judge nothing. Each type exports `dataSetPeriod(model)`, the
years its execution reads, and declares `dataSetPeriodRequirement` (`NO_PERIOD_OVERLAP` at `sources.dataSets`, naming
the years) for the operations reading that imagery:

| Type | Years read | Held when no chosen data set may contribute |
| --- | --- | --- |
| Optical Mosaic | Its season, from `yearsBefore` before to `yearsAfter` after | Image, with all scenes. Selected scenes are composited by id, whatever the dates. |
| CCDC | `startDate` until `endDate`, excluded | Image, pixel observations, pixel segments, count |
| Time Series | `startDate` until `endDate`, excluded | Image (and its download), pixel observations |
| Phenology | `fromYear` to `toYear` | Image |
| LandTrendr | `startYear` to `endYear` | Image. The annual mosaic reads its own year and is not judged. |
| Change Alerts | Calibration start until monitoring end, excluded (`periodDates`) | Image, pixel observations. The reference's segments are not. |
| PyEO Alerts | `monitoringStart` until `monitoringEnd`, excluded, as a classification's proposal would save them | Image. The baseline is the Classification's image. |

Retained data sets still narrow the bands, as execution intersects every chosen data set's bands before it filters
scenes by date (`lib/js/ee/src/optical/collection.js`).

In Sources (`dataSetOptions`, `modules/gui/src/sources.js`), a data set those years exclude cannot be chosen anew. One
the draft chooses - a saved recipe's choice included, as it opens - stays chosen and can be removed, its tooltip giving
the catalogue years it holds imagery for. Removed, it cannot be chosen again, even while the applied recipe still holds
it, until dates its years cover offer it again. No Dates Apply removes data sets, and no render prunes them. A selection
some of which may contribute is neither marked nor held, so a functioning recipe keeping data sets older defaults chose
stays as it was. A collection type chosen anew starts with its first data set that may contribute, or none.
`NO_PERIOD_OVERLAP` is said beside the data sets and on the Sources toolbar button (`dataSetPeriodRequirement.js`) only
where none chosen may contribute, and a Sources draft leaving none able to cannot be applied, by Apply, Enter or a
wizard step. A Dates Apply is not refused: it marks Sources until Sources or Dates repair them.

#### Initial data sets

A new recipe's Sources start from the data sets its type prefers, declared on its GUI registration beside its default
model (`initialSources`: Optical Mosaic Landsat 9 and 8, Phenology Landsat 8, CCDC, Time Series and LandTrendr Landsat 9
to 4-5, Change Alerts those and Sentinel-2). As the set-up wizard first opens Sources, the shared initialization
(`initialSectionModel`, `modules/gui/src/app/home/body/process/recipe/initialSources.js`, from `recipeFormPanel`'s
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
`modules/gui/src/app/home/body/process/recipe/dataSetAvailability.test.jsx`; initial data sets through the real wizard,
default models and each type's own root and toolbar in `initialSources.test.jsx`; and PyEO's proposals in
`pyeoAlerts/panels/sources/sourcesProposal.test.jsx`.
