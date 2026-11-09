import _ from 'lodash'

import {collectionBandRequirement} from '../collectionBands.js'
import {dataSetPeriodRequirement, periodOfYears} from '../dataSetAvailability.js'
import {defineRecipeType} from '../defineRecipeType.js'
import {mapProduct} from '../output/product.js'
import {imageOutputProvider} from '../output/provider.js'
import {IMAGE_OUTPUT, REFERENCE} from '../output/readiness.js'
import {AOI, fromAoi} from '../source/aoi.js'
import {CLASSIFICATION_SOURCE, fromCollectionSources, SOURCE_IMAGERY} from '../source/collectionSources.js'

// LandTrendr segments a yearly index series over its AOI (lib/js/ee/src/timeSeries/landTrendr.js). It has no
// imageFactory call of its own and reaches both of its dependencies through shared helpers: `model.aoi`
// through toGeometry$, and `model.sources` through getCollection$ - the same collection owner CCDC, Time
// Series and Phenology use. It rebuilds a per-year collection recipe around its own dates and hands the
// sources submodel through unchanged, so it inherits that submodel's contract in full.
//
// What that contract resolves is not uniform. A classification is always resolved, because getCollection$
// loads it before it chooses a branch. An asset list is resolved only on the Planet branch. LandTrendr's own
// sources panel offers optical data sets only (recipe/landTrendr/panels/sources/sources.jsx renders
// opticalDataSetOptions) and writes neither field, so a recipe saved through the GUI carries no
// classification and no assets, and its data sets select Optical. An asset list that arrives some other way -
// an older model, a programmatic one - is therefore ignored while those data sets stand.
//
// The full collection contract is declared here rather than just the AOI because the helper decides which
// half applies from the data sets, and that decision is shared with execution.
//
// `sources.dataSets` holds catalogue identifiers - LANDSAT, SENTINEL_2 - and `sources.index` is a band name.
// Neither is a reference.

export {CLASSIFICATION_SOURCE, SOURCE_IMAGERY}

// The change result: the greatest change segment's year of detection, magnitude and duration, the fitted values
// before and after it, the fit's error and the magnitude as a multiple of that error - in the order execution builds
// them, whatever the configuration. yod and dur are whole years, which averaging at coarser pyramid levels would
// turn into years no pixel has, so they are sampled; the rest are continuous and averaged. No encoding is declared.
// The annual context mosaic a layer can show instead is a separate product, not this output.
export const LANDTRENDR_BANDS = [
    ['yod', 'sample'],
    ['mag', 'mean'],
    ['dur', 'sample'],
    ['preval', 'mean'],
    ['postval', 'mean'],
    ['rmse', 'mean'],
    ['sig', 'mean']
].map(([name, pyramidingPolicy]) => ({name, dataType: {arrayDimensions: 0}, pyramidingPolicy}))

// The annual context mosaic a layer can show instead: an Optical Mosaic of one calendar year, over the same AOI, data
// sets and options the series was fitted to. It is not the series itself - that is a single direction-flipped index
// band whose yearly value is the median of the per-scene index, whereas the mosaic derives its indexes from the
// already-composited bands - so its index band will not match preval/postval exactly.
export const ANNUAL_MOSAIC = 'ANNUAL_MOSAIC'

// The year an annual mosaic shows when none is asked for: the last year the series was fitted to. Null counts as none.
export const annualMosaicYear = (recipe, year) =>
    year ?? recipe?.model?.dates?.endYear

// Any integer year, including one outside the fitted range: the range is the picker's, not execution's.
export const annualMosaicParameters = (recipe, {year, ...unknown} = {}) => {
    const shown = annualMosaicYear(recipe, year)
    const diagnostics = [
        ...(Number.isInteger(shown) ? [] : [{path: ['year']}]),
        ...Object.keys(unknown).map(name => ({path: [name]}))
    ]
    return diagnostics.length
        ? {diagnostics}
        : {parameters: {year: shown}}
}

// The mosaic recipe both described and executed for an integer year: compositing is MEDIAN whatever the options say.
export const annualMosaicRecipe = (recipe, year) => ({
    type: 'MOSAIC',
    model: {
        aoi: recipe.model.aoi,
        dates: {
            targetDate: `${year}-07-01`,
            seasonStart: `${year}-01-01`,
            seasonEnd: `${year + 1}-01-01`,
            yearsBefore: 0,
            yearsAfter: 0
        },
        sources: recipe.model.sources,
        sceneSelectionOptions: {type: 'ALL'},
        compositeOptions: {
            ...recipe.model.options,
            compose: 'MEDIAN'
        }
    }
})

export const MISSING_DATA_SETS = 'MISSING_DATA_SETS'
export const MISSING_INDEX = 'MISSING_INDEX'

// The years its change map is fitted to (lib/js/ee/src/timeSeries/landTrendr.js); an annual mosaic reads its own.
export const dataSetPeriod = model => periodOfYears(model?.dates?.startYear, model?.dates?.endYear)

const CARRIED_INDEX = collectionBandRequirement({field: 'index', operations: [IMAGE_OUTPUT]})

const DATA_SETS_CHOSEN = {
    code: MISSING_DATA_SETS,
    operations: [IMAGE_OUTPUT],
    findings: model => chosenDataSets(model).length ? [] : [{path: ['model', 'sources', 'dataSets']}]
}

const PERIOD_COVERED = dataSetPeriodRequirement({period: dataSetPeriod, operations: [IMAGE_OUTPUT]})

// What its change map needs of its Sources (lib/js/ee/src/timeSeries/landTrendr.js): data sets, at least one of which
// the catalogue says may hold imagery in its years - which establishes imagery is possible, not that a scene exists or
// enough do - and an index the collection they configure can carry. That is judged over every data set chosen, one the
// dates exclude included, as execution intersects their bands whatever the dates. The annual mosaic reads no index and is
// asked for a year of its own, so none of these hold it.
const sourcesRequirements = [
    DATA_SETS_CHOSEN,
    PERIOD_COVERED,
    {
        code: MISSING_INDEX,
        operations: [IMAGE_OUTPUT],
        findings: model => model.sources?.index ? [] : [{path: ['model', 'sources', 'index']}]
    },
    // A blank index is a missing one, not one the collection cannot compute.
    {
        ...CARRIED_INDEX,
        findings: model => model.sources?.index
            ? CARRIED_INDEX.findings(model).map(finding => withRemovable(model, finding))
            : []
    }
]

// Removing the data sets lacking the index's inputs repairs it only where the Sources left would meet every requirement
// above: some data set remains, may cover the years, and carries the index (`removable`).
const withRemovable = (model, finding) => {
    const lacking = _.uniq((finding.missingInputs || []).flatMap(({dataSets}) => dataSets))
    const remaining = {...model, sources: {...model.sources, dataSets: withoutDataSets(model.sources.dataSets, lacking)}}
    return lacking.length && [DATA_SETS_CHOSEN, PERIOD_COVERED, CARRIED_INDEX].every(({findings}) => !findings(remaining).length)
        ? {...finding, removable: lacking}
        : finding
}

// Each group read as chosenDataSets reads it, a single identifier as a list of one.
const withoutDataSets = (dataSets, removed) => _.pickBy(
    _.mapValues(dataSets, chosen => [chosen].flat().filter(dataSet => !removed.includes(dataSet))),
    chosen => chosen.length
)

const chosenDataSets = model => Object.values(model.sources?.dataSets || {}).flat()

export default defineRecipeType({
    type: 'LANDTRENDR',
    directSources: model => [
        ...fromAoi({model, keys: ['aoi']}),
        ...fromCollectionSources(model)
    ],
    executionNeeds: {[IMAGE_OUTPUT]: {[AOI]: REFERENCE, [CLASSIFICATION_SOURCE]: REFERENCE, [SOURCE_IMAGERY]: REFERENCE}},
    configurationRequirements: sourcesRequirements,
    imageOutput: imageOutputProvider({
        describe: () => ({bands: LANDTRENDR_BANDS, evidence: []})
    }),
    mapProducts: {
        [ANNUAL_MOSAIC]: mapProduct({
            parameters: ({recipe, parameters}) => annualMosaicParameters(recipe, parameters),
            delegatesTo: 'MOSAIC',
            describe: ({recipe, parameters: {year}, delegate}) => delegate(annualMosaicRecipe(recipe, year))
        })
    }
})
