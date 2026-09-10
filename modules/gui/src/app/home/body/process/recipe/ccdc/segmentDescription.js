import {of} from 'rxjs'

import {CLASSIFICATION_SOURCE} from '#sepal/recipe/source/collectionSources'
import {getAvailableBands} from '~/sources'

import {getAllVisualizations} from './ccdcRecipe'

// What a CCDC recipe says about the segments image it produces. CCDC owns this description: which base
// bands it fits, the measures each of them carries, the segment timing bands, how dates are represented,
// the period fitted, and the presentation templates that describe its output. A consumer transforming
// the segments - CCDC Slice - reads this and nothing else about CCDC.
//
// Pure. The Classification a CCDC recipe may classify by is one of its declared dependencies, so it arrives
// resolved with the rest of the closure; this reads the record it is handed and never loads anything.
//
// Measures are what the running image will actually carry per base band. A coefficient array stands for
// the nine values Slice derives from it, and rmse and magnitude are fitted alongside every band - that is
// what lib/js/ee/src/timeSeries/ccdc.js produces, and advertising anything else would be a promise the
// image cannot keep.

// What a fitted band carries: the nine values its coefficient array stands for, plus the residual and
// magnitude fitted alongside it.
export const FITTED_MEASURES = [
    'value', 'intercept', 'slope',
    'phase_1', 'amplitude_1', 'phase_2', 'amplitude_2', 'phase_3', 'amplitude_3',
    'rmse', 'magnitude'
]

export const SEGMENT_BANDS = ['tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb']

export const describeSegments = (ccdc, {classification} = {}) => {
    const baseBandNames = getAvailableBands({
        dataSets: Object.values(ccdc.model.sources?.dataSets || {}).flat(),
        corrections: ccdc.model.options?.corrections,
        classification: classification
            ? {
                id: classification.id,
                classifierType: classification.model.classifier?.type,
                classificationLegend: classification.model.legend,
                include: ['regression', 'probabilities']
            }
            : {}
    })
    const baseBands = baseBandNames.map(name => ({name, measures: FITTED_MEASURES}))
    return {
        bands: physicalBands(baseBandNames),
        baseBands,
        segmentBands: SEGMENT_BANDS.map(name => ({name})),
        dateFormat: ccdc.model.ccdcOptions?.dateFormat,
        startDate: ccdc.model.dates?.startDate,
        endDate: ccdc.model.dates?.endDate,
        visualizations: getAllVisualizations(ccdc)
    }
}

// The physical bands of the segments image: per base band a coefficient array, an rmse and a magnitude,
// then the timing bands - the order lib/js/ee/src/timeSeries/ccdc.js writes them in.
const physicalBands = baseBandNames => [
    ...baseBandNames.flatMap(name => [`${name}_coefs`, `${name}_rmse`, `${name}_magnitude`]),
    ...SEGMENT_BANDS
]

// The provider CCDC registers: a reader of segments asks the producer, and the producer finds the
// Classification it fits through the edge it declares rather than being read from outside.
export const describeSegments$ = ({recipe, graph, recipesById}) =>
    of(describeSegments(recipe, {classification: classificationOf(recipe, graph, recipesById)}))

const classificationOf = (ccdc, graph, recipesById) => {
    const edge = (graph?.edges || []).find(({sourceRecipeId, role}) =>
        sourceRecipeId === ccdc.id && role === CLASSIFICATION_SOURCE)
    return edge ? recipesById.get(edge.reference.id) : undefined
}
