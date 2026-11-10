import {classifiedOutputNeed, classifiedOutputRequirement, collectionRegressionEncoding} from '../classifiedOutputs.js'
import {collectionBandRequirement} from '../collectionBands.js'
import {dataSetPeriodRequirement, periodOfYears} from '../dataSetAvailability.js'
import {defineRecipeType} from '../defineRecipeType.js'
import {imageOutputProvider} from '../output/provider.js'
import {IMAGE_OUTPUT, REFERENCE} from '../output/readiness.js'
import {AOI, fromAoi} from '../source/aoi.js'
import {CLASSIFICATION_SOURCE, collectionClassifierRequirement, fromCollectionSources, SOURCE_IMAGERY} from '../source/collectionSources.js'

// Phenology derives seasonality over its AOI from the same shared collection submodel
// (lib/js/ee/src/timeSeries/phenology.js). `sources.band` names which band of that collection it reads; it is
// a band name, not a reference. A band of the images must be one the collection carries, and reads nothing of the
// Classification but what its classifier reads of them. A band the Classification computes must be one it provides, and
// computing it trains that Classification's classifier and applies it to every image of the collection (CLASSIFIER).

export {CLASSIFICATION_SOURCE, SOURCE_IMAGERY}

// The seasonal metrics: overall, then for each of the four segments between the turning points of the year.
export const PHENOLOGY_METRIC_BANDS = [
    'background', 'amplitude', 'median',
    ...[1, 2, 3, 4].flatMap(segment => ['dayOfYear', 'days', 'median', 'slope', 'offset'].map(metric => `${metric}_${segment}`))
]

// One composite per month. A month without observations is a masked band, so these do not depend on the imagery.
export const PHENOLOGY_MONTH_BANDS = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'
]

// Every band, whatever the configuration, in the order execution builds them. Its per-segment arrays are internal.
// Native encodings remain unknown; the provider states the established scale of computed regression values.
export const PHENOLOGY_BANDS = [...PHENOLOGY_METRIC_BANDS, ...PHENOLOGY_MONTH_BANDS]
    .map(name => ({name, dataType: {arrayDimensions: 0}, pyramidingPolicy: 'mean'}))

// The years it analyses (lib/js/ee/src/timeSeries/phenology.js), whole calendar years.
export const dataSetPeriod = model => periodOfYears(model?.dates?.fromYear, model?.dates?.toYear)

export default defineRecipeType({
    type: 'PHENOLOGY',
    directSources: model => [
        ...fromAoi({model, keys: ['aoi']}),
        ...fromCollectionSources(model)
    ],
    executionNeeds: {[IMAGE_OUTPUT]: {
        [AOI]: REFERENCE,
        [CLASSIFICATION_SOURCE]: classifiedOutputNeed('band'),
        [SOURCE_IMAGERY]: REFERENCE
    }},
    configurationRequirements: [
        dataSetPeriodRequirement({period: dataSetPeriod, operations: [IMAGE_OUTPUT]}),
        {...collectionClassifierRequirement({period: dataSetPeriod}), operations: [IMAGE_OUTPUT]},
        collectionBandRequirement({field: 'band', operations: [IMAGE_OUTPUT]}),
        classifiedOutputRequirement({field: 'band', role: CLASSIFICATION_SOURCE, operations: [IMAGE_OUTPUT]})
    ],
    imageOutput: imageOutputProvider({
        describe: ({recipe: {model}}) => ({
            bands: model?.sources?.classification && model.sources.band === 'regression'
                ? PHENOLOGY_BANDS.map(band => /^(dayOfYear|days)_/.test(band.name)
                    ? band : {...band, encoding: collectionRegressionEncoding(model)})
                : PHENOLOGY_BANDS,
            evidence: []
        })
    })
})
