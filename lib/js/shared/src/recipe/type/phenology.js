import {defineRecipeType} from '../defineRecipeType.js'
import {imageOutputProvider} from '../output/provider.js'
import {fromAoi} from '../source/aoi.js'
import {CLASSIFICATION_SOURCE, fromCollectionSources, SOURCE_IMAGERY} from '../source/collectionSources.js'

// Phenology derives seasonality over its AOI from the same shared collection submodel
// (lib/js/ee/src/timeSeries/phenology.js). `sources.band` names which band of that collection it reads; it is
// a band name, not a reference.

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
    imageOutput: imageOutputProvider({
        describe: () => ({bands: PHENOLOGY_BANDS, evidence: []})
    })
})
