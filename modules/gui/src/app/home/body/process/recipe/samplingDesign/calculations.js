import {
    sameFrame,
    STRATUM_AREAS,
    STRATUM_FRAME,
    STRATUM_FRAME_DEPENDENCY,
    stratumFrameQuestion,
    usesStratumAreas
} from '#sepal/recipe/samplingDesign/stratumFrame'
import {
    PROBABILITY_SOURCE_DEPENDENCY,
    probabilitySourceQuestion,
    STRATUM_PROBABILITIES
} from '#sepal/recipe/samplingDesign/stratumProbabilities'
import api from '~/apiRegistry'

import {editedProportionsStatus, editedStrataStatus, STRATUM_PROBABILITIES as PROBABILITIES_OPERATION} from './freshnessRequirements'
import {proportionsCoverStrata} from './sampling/designModel'
import {isValidGridScale} from './samplingGridValidation'

// What Sampling Design's panels calculate (calculatedResult.js): the stratum areas, with the evidence of the stratum frame
// they read, and the probabilities automatic proportions are anticipated from, with the evidence of the frame and the
// probability source. Online and Batch answer the same question, so neither is part of it - the mode chosen beside the
// result is how it is asked; presentation is applied to whatever is answered.

export const STRATUM_AREAS_CALCULATION = 'stratumAreas'
export const STRATUM_PROBABILITIES_CALCULATION = 'stratumProbabilities'

export const samplingDesignCalculations = [
    {
        id: STRATUM_AREAS_CALCULATION,
        panel: 'stratification',
        kind: STRATUM_AREAS,
        dependencies: [STRATUM_FRAME_DEPENDENCY],
        question: model => areaQuestion(model),
        answered: ({stratification}) => Boolean(stratification?.strata?.length),
        batch: ({stratification}) => stratification?.eeStrategy === 'BATCH',
        request$: (question, {batch}) => api.gee.areaPerStratum$({...question, batch, evidence: true}),
        status: editedStrataStatus
    },
    {
        id: STRATUM_PROBABILITIES_CALCULATION,
        panel: 'proportions',
        kind: STRATUM_PROBABILITIES,
        dependencies: [STRATUM_FRAME_DEPENDENCY, PROBABILITY_SOURCE_DEPENDENCY],
        question: model => probabilityQuestion(model),
        // Rows for strata that have since changed answer for other strata: recalculated areas over an unchanged frame.
        answered: model => proportionsCoverStrata(model),
        batch: ({proportions}) => proportions?.eeStrategy === 'BATCH',
        // A stratified design's probabilities group pixels by its strata, so they are calculated over current areas only,
        // and taken only over the frame those areas were calculated from: equal areas and weights say nothing about which
        // pixels belong to each stratum.
        operation: PROBABILITIES_OPERATION,
        fits: ({calculatedFrom}, recipe) => !usesStratumAreas(recipe.model)
            || sameFrame(calculatedFrom.dependencies[STRATUM_FRAME], recipe.model.stratification.strataCalculatedFrom?.dependencies?.[STRATUM_FRAME]),
        request$: (question, {batch}) => api.gee.probabilityPerStratum$({...question, batch, evidence: true}),
        status: editedProportionsStatus
    }
]

// The AOI, the source and band, and the grid; null while it cannot be asked - a half-typed Scale is not calculated yet.
const areaQuestion = ({aoi, stratification = {}}) => {
    const {skip, type, recipeId, assetId, band, crs, scale} = stratification
    const id = type === 'RECIPE' ? recipeId : assetId
    if (skip || !isValidGridScale(scale) || !crs || !id || !band) {
        return null
    }
    return {aoi, stratification: {type: type === 'RECIPE' ? 'RECIPE_REF' : 'ASSET', id}, band, crs, scale}
}

// The raw probabilities: the AOI and strata, the probability source and band, its mode and Scale, in the frame's CRS -
// asked as the evidence of both dependencies records them, so nothing is asked of a selection they read nothing for. The
// percentage interpretation, the overall-proportion override and the weights are applied to the answer.
const probabilityQuestion = model => {
    const {anticipationStrategy, targetClass, scale} = model.proportions || {}
    const source = probabilitySourceQuestion(model)
    const categorical = anticipationStrategy === 'CATEGORICAL'
    if (!source || (categorical && (targetClass == null || targetClass === '')) || !isValidGridScale(scale)) {
        return null
    }
    const frame = stratumFrameQuestion(model)
    return {
        aoi: model.aoi,
        stratification: frame.stratification?.reference || null,
        stratificationBand: model.stratification?.band,
        probability: source.reference,
        probabilityBand: source.band,
        mode: anticipationStrategy,
        targetClass: categorical ? Number(targetClass) : undefined,
        scale,
        crs: frame.crs
    }
}
