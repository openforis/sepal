import {classifiedOutputRequirement, isClassifiedOutput} from '../classifiedOutputs.js'
import {defineRecipeType} from '../defineRecipeType.js'
import {imageOutputProvider} from '../output/provider.js'
import {CLASSIFIER, conditionalNeed, IMAGE_OUTPUT, REFERENCE} from '../output/readiness.js'
import {AOI, fromAoi} from '../source/aoi.js'
import {CLASSIFICATION_SOURCE, collectionClassifierRequirement, fromCollectionSources, SOURCE_IMAGERY} from '../source/collectionSources.js'

// Phenology derives seasonality over its AOI from the same shared collection submodel
// (lib/js/ee/src/timeSeries/phenology.js). `sources.band` names which band of that collection it reads; it is
// a band name, not a reference. A band the Classification computes must be one it provides, and computing it trains
// that Classification's classifier and applies it to every image of the collection (CLASSIFIER); a band of the images
// reads nothing of the Classification but what its classifier reads of them.

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
// No encoding: the composites carry whatever the analysed band's values mean, which the recipe does not state.
export const PHENOLOGY_BANDS = [...PHENOLOGY_METRIC_BANDS, ...PHENOLOGY_MONTH_BANDS]
    .map(name => ({name, dataType: {arrayDimensions: 0}, pyramidingPolicy: 'mean'}))

export default defineRecipeType({
    type: 'PHENOLOGY',
    directSources: model => [
        ...fromAoi({model, keys: ['aoi']}),
        ...fromCollectionSources(model)
    ],
    executionNeeds: {[IMAGE_OUTPUT]: {
        [AOI]: REFERENCE,
        [CLASSIFICATION_SOURCE]: conditionalNeed({when: model => isClassifiedOutput(model?.sources?.band), then: CLASSIFIER, otherwise: REFERENCE}),
        [SOURCE_IMAGERY]: REFERENCE
    }},
    configurationRequirements: [
        collectionClassifierRequirement,
        classifiedOutputRequirement({field: 'band', role: CLASSIFICATION_SOURCE, operations: [IMAGE_OUTPUT]})
    ],
    imageOutput: imageOutputProvider({
        describe: () => ({bands: PHENOLOGY_BANDS, evidence: []})
    })
})
