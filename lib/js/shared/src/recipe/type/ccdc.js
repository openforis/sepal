import _ from 'lodash'

import {collectionType, PLANET, planetSource, RADAR} from '../collectionType.js'
import {defineRecipeType} from '../defineRecipeType.js'
import {getAvailableIndexes, selectableBands} from '../optical/opticalBands.js'
import {AVAILABLE_BANDS, imageOutputProvider} from '../output/provider.js'
import {planetBandNames} from '../planet/planetBands.js'
import {fromAoi} from '../source/aoi.js'
import {CLASSIFICATION_SOURCE, fromCollectionSources, SOURCE_IMAGERY} from '../source/collectionSources.js'

// CCDC's direct sources, from what its Earth Engine implementation reads:
//
//   model.aoi      clips the segments image and filters the collection (lib/js/ee/src/timeSeries/ccdc.js)
//   model.sources  the collection submodel every collection-backed recipe shares
//                  (lib/js/ee/src/timeSeries/collection.js)
//
// The measures CCDC can fit, and the physical bands they produce, are declared here and nowhere else: the
// Earth Engine implementation builds both its catalogue and its segments image from these rules, and the
// output declaration describes the same catalogue. CCDC fits only the measures it is asked for, so the image
// it builds for an empty request holds the breakpoint measures alone and describes nothing that is available.
//
// The legacy GUI `noImageOutput` flag excludes CCDC from broad recipe selectors. It controls no export path;
// CCDC's custom export task is independent of whether its canonical image output exists.

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
    ]).filter(measure => !UNFITTABLE.includes(measure))

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

export default defineRecipeType({
    type: 'CCDC',
    segmentSource,
    directSources: model => [
        ...fromAoi({model, keys: ['aoi']}),
        ...fromCollectionSources(model)
    ],
    imageOutput: imageOutputProvider({
        observes: AVAILABLE_BANDS,
        describe: ({observation}) => {
            const available = observation()
            return available && {
                bands: ccdcPhysicalBands(available.bands.map(({name}) => name)),
                evidence: []
            }
        }
    })
})

const COEFFICIENT_DIMENSIONS = 2
const SEGMENT_DIMENSIONS = 1

// The date bands a composite keeps are per-scene metadata, not a signal to fit.
const UNFITTABLE = ['dayOfYear', 'daysFromTarget']

// A CCDC radar collection is per-image rather than a composite: lib/js/ee/src/radar/collection.js carries the
// two polarisations and the relative orbit number, and timeSeries/collection.js derives their ratio whenever
// it is asked for.
const RADAR_MEASURES = ['VV', 'VH', 'ratio_VV_VH', 'orbit']

// The branch collection.js takes, so the measures declared here are the ones it would actually build.
const collectionMeasures = (model, nativeBands) => {
    switch (collectionType(model?.sources?.dataSets)) {
        case RADAR: return RADAR_MEASURES
        case PLANET: return planetMeasures(model, nativeBands)
        default: return selectableBands(opticalModel(model))
    }
}

// The Planet collection carries whatever its own imagery and processing leave it with, and
// timeSeries/collection.js adds whichever indexes those bands support. Which collection it is comes from the
// first selected data set, exactly as planetImages reads it.
const planetMeasures = (model, nativeBands) => {
    const bands = planetBandNames({
        source: planetSource(model?.sources?.dataSets),
        histogramMatching: model?.options?.histogramMatching,
        nativeBands
    })
    return [...bands, ...getAvailableIndexes(bands)]
}

// Only what addClassificationBands actually adds: `class` and `class_probability` are neither selected nor
// scaled there, so CCDC never receives them.
const classificationMeasures = bands =>
    (bands || []).filter(band => band === 'regression' || band.startsWith('probability_'))

// Matches getCollection$: omitted corrections mean TOA without BRDF.
const opticalModel = model => ({
    sources: model?.sources,
    compositeOptions: {...model?.options, corrections: model?.options?.corrections ?? []}
})
