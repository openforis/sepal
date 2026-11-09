import _ from 'lodash'

import {classifiedOutputRequirement, collectionRegressionEncoding} from '../classifiedOutputs.js'
import {collectionBandRequirement, collectionMeasures} from '../collectionBands.js'
import {dataSetPeriodRequirement, periodOfDates} from '../dataSetAvailability.js'
import {defineRecipeType} from '../defineRecipeType.js'
import {mapProduct} from '../output/product.js'
import {AVAILABLE_BANDS, imageOutputProvider} from '../output/provider.js'
import {IMAGE_OUTPUT, PIXEL_OBSERVATIONS, PIXEL_SEGMENTS, REFERENCE} from '../output/readiness.js'
import {AOI, fromAoi} from '../source/aoi.js'
import {
    CLASSIFICATION_SOURCE,
    fromCollectionSources,
    selectedClassificationPrerequisites,
    SOURCE_IMAGERY
} from '../source/collectionSources.js'

// CCDC's direct sources, from what its Earth Engine implementation reads:
//
//   model.aoi      clips the segments image and filters the collection (lib/js/ee/src/timeSeries/ccdc.js)
//   model.sources  the collection submodel every collection-backed recipe shares
//                  (lib/js/ee/src/timeSeries/collection.js)
//
// The measures CCDC can fit - those its collection carries (collectionBands.js) and those its Classification adds - and
// the physical bands they produce are declared here and nowhere else: the Earth Engine implementation builds both its
// catalogue and its segments image from these rules, and the output declaration describes the same catalogue. CCDC fits
// only the measures it is asked for, so the image it builds for an empty request holds the breakpoint measures alone and
// describes nothing that is available.
//
// Its GUI registration states it is no image source, which excludes CCDC from broad recipe selectors while Masking
// still masks it as a source of segments. That eligibility controls no export path; CCDC's custom export task is
// independent of it.

export {CLASSIFICATION_SOURCE, SOURCE_IMAGERY}

export const SEGMENT_BANDS = ['tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb']

export const MEASURE_SUFFIXES = ['coefs', 'rmse', 'magnitude']

// CCDC's segments carry its own band names, and its dates are stored in the representation its break
// detection was configured with.
export const segmentSource = {
    dateFormat: model => model?.ccdcOptions?.dateFormat,
    selectableBaseBands: true
}

// Every measure the collection this model configures can supply. Two facts only the runtime holding the
// records can read are passed in rather than derived here: the bands a classification contributes, and the
// band names the configured Planet imagery itself carries.
//
// The configured breakpoint bands are deliberately not added. They are the user's saved intent, and a
// collection that no longer carries one cannot be asked to produce it - segmentation has no input to fit.
// Advertising it would offer an export that cannot run; the stale configuration itself is left untouched.
export const ccdcMeasures = ({model, classificationBands, nativeBands}) =>
    _.uniq([
        ...collectionMeasures(model, nativeBands),
        ...classificationMeasures(classificationBands)
    ])

// The measures a request for these measures fits: breakpoint detection needs the configured breakpoint bands, so
// they are fitted, and exported, whatever else is asked for. A configured one the collection no longer carries is
// still asked for, and cannot be fitted.
export const fittedMeasures = (model, measures) =>
    _.uniq([...(measures || []), ...(model?.sources?.breakpointBands || [])])

// The bands the segments image carries, in the order it carries them.
export const ccdcOutputBands = measures => [
    ...SEGMENT_BANDS,
    ...(measures || []).flatMap(measure => MEASURE_SUFFIXES.map(suffix => `${measure}_${suffix}`))
]

// Coefficients are one array per segment of one coefficient per term; every other band is one value per
// segment. Neither can be pyramided by averaging, which is why CCDC exports with `sample` throughout -
// modules/task/src/tasks/ccdcAssetExport.js and lib/js/ee/src/timeSeries/temporalSegmentation.js both say so.
export const ccdcPhysicalBands = bandNames => (bandNames || []).map(name => ({
    name,
    dataType: {arrayDimensions: name.endsWith('_coefs') ? COEFFICIENT_DIMENSIONS : SEGMENT_DIMENSIONS},
    pyramidingPolicy: 'sample'
}))

// The measures a request for a CCDC's image asks it to fit beyond its breakpoint bands, as execution reads the request
// (lib/js/ee/src/timeSeries/ccdc.js): those the physical bands it names are built from (`outputBands`, measuresFor),
// otherwise those it selects (`selection`); the count map product fits none. A segment timing band is built from no
// measure. What the collection then builds is these with the breakpoint bands (fittedMeasures).
export const requestedMeasures = ({selection = [], outputBands, visualizationType} = {}) => {
    const measures = outputBands?.length ? measuresFor(outputBands) : selection
    return visualizationType === COUNT ? [] : measures
}

// The measures named physical bands are built from, for an operation that asks for bands rather than measures.
export const measuresFor = outputBands => _.uniq(outputBands
    .filter(band => !SEGMENT_BANDS.includes(band))
    .map(band => {
        const suffix = MEASURE_SUFFIXES.find(suffix => band.endsWith(`_${suffix}`))
        if (!suffix) {
            throw new Error(`Not a CCDC output band: ${band}`)
        }
        return band.slice(0, -(suffix.length + 1))
    })
)

// The bands TMask screens a pixel's observations with, where it is enabled: Earth Engine is given them only as exactly two
// (lib/js/ee/src/timeSeries/ccdc.js), and any other selection runs no TMask.
export const enabledTmaskBands = ccdcOptions => ccdcOptions?.tmaskBands?.length === 2 ? ccdcOptions.tmaskBands : undefined

// An enabled TMask screens with bands CCDC segments, so each must be a breakpoint band. Found at the TMask bands, naming
// those that are not (`missing`), for whatever segments the pixels; the count segments nothing.
export const NON_BREAKPOINT_TMASK_BANDS = 'NON_BREAKPOINT_TMASK_BANDS'

const tmaskRequirement = {
    code: NON_BREAKPOINT_TMASK_BANDS,
    operations: [IMAGE_OUTPUT, PIXEL_SEGMENTS],
    findings: model => {
        const missing = (enabledTmaskBands(model.ccdcOptions) || [])
            .filter(band => !(model.sources?.breakpointBands || []).includes(band))
        return missing.length ? [{path: ['model', 'ccdcOptions', 'tmaskBands'], missing}] : []
    }
}

// The map product showing how many observations each pixel's segmentation was fitted to. It is not the segments
// image: counting needs no segmentation and no catalogue of measures. Shown, never exported.
export const COUNT = 'COUNT'
export const CCDC_COUNT_BANDS = [
    {name: 'count', dataType: {arrayDimensions: 0}}
]

// The days its collection is filtered to (getCollection$, lib/js/ee/src/timeSeries/collection.js), its end excluded: what
// its segments, its count and its pixel charts read.
export const dataSetPeriod = model => periodOfDates(model?.dates?.startDate, model?.dates?.endDate)

export default defineRecipeType({
    type: 'CCDC',
    segmentSource,
    directSources: model => [
        ...fromAoi({model, keys: ['aoi']}),
        ...fromCollectionSources(model)
    ],
    // A Classification its Sources select is part of the analysis configured: every operation, and its count map
    // product, needs it trainable, whatever is asked for or fitted (selectedClassificationPrerequisites,
    // collectionSources.js). With none selected, nothing. What reads its segments as its image - CCDC Slice, a Change
    // Alerts' segment chart, a Masking of it - is held to the same, through its own need of that image. Its pixel chart
    // observes the collection, and fits its segments, at the clicked point, which stands in for the AOI.
    analysisPrerequisites: selectedClassificationPrerequisites,
    executionNeeds: {
        [IMAGE_OUTPUT]: {[AOI]: REFERENCE, [SOURCE_IMAGERY]: REFERENCE},
        [PIXEL_OBSERVATIONS]: {[SOURCE_IMAGERY]: REFERENCE},
        [PIXEL_SEGMENTS]: {[SOURCE_IMAGERY]: REFERENCE}
    },
    // Its breakpoint bands are fitted by every segmentation it runs, and collected for its count, so each must be one the
    // collection carries, or a classified one the Classification provides; the measures an export or a chart adds are
    // asked for there. Its TMask screens with breakpoint bands.
    configurationRequirements: [
        dataSetPeriodRequirement({period: dataSetPeriod, operations: [IMAGE_OUTPUT, PIXEL_OBSERVATIONS, PIXEL_SEGMENTS, COUNT]}),
        collectionBandRequirement({field: 'breakpointBands', operations: [IMAGE_OUTPUT, PIXEL_SEGMENTS, COUNT]}),
        classifiedOutputRequirement({field: 'breakpointBands', role: CLASSIFICATION_SOURCE, operations: [IMAGE_OUTPUT, PIXEL_SEGMENTS, COUNT]}),
        tmaskRequirement
    ],
    imageOutput: imageOutputProvider({
        observes: AVAILABLE_BANDS,
        describe: ({recipe, observation}) => {
            const available = observation()
            return available && {
                bands: ccdcPhysicalBands(available.bands.map(({name}) => name)).map(band =>
                    recipe.model?.sources?.classification && MEASURE_SUFFIXES.some(suffix => band.name === `regression_${suffix}`)
                        ? {...band, encoding: collectionRegressionEncoding(recipe.model)} : band
                ),
                evidence: []
            }
        }
    }),
    mapProducts: {
        [COUNT]: mapProduct({
            describe: () => ({bands: CCDC_COUNT_BANDS, evidence: []})
        })
    }
})

const COEFFICIENT_DIMENSIONS = 2
const SEGMENT_DIMENSIONS = 1

// Only what addClassificationBands actually adds: `class` and `class_probability` are neither selected nor
// scaled there, so CCDC never receives them.
const classificationMeasures = bands =>
    (bands || []).filter(band => band === 'regression' || band.startsWith('probability_'))
