import {DEFAULT_SAMPLING_GRID_CRS} from '#sepal/recipe/samplingDesign/samplingGridCrs'
import {
    sameFrame,
    STRATUM_AREAS,
    STRATUM_FRAME,
    STRATUM_FRAME_DEPENDENCY,
    usesStratumAreas
} from '#sepal/recipe/samplingDesign/stratumFrame'
import api from '~/apiRegistry'

import {editedProportionsStatus, editedStrataStatus, STRATUM_PROBABILITIES} from './freshnessRequirements'
import {isValidGridScale} from './samplingGridValidation'

// What Sampling Design's panels calculate (calculatedResult.js): the stratum areas, and the probabilities automatic
// proportions are anticipated from, each with the evidence of the stratum frame it read. Online and Batch answer the same
// question, so neither is part of it - the mode chosen beside the result is how it is asked; presentation is applied to
// whatever is answered.

export const STRATUM_AREAS_CALCULATION = 'stratumAreas'
export const STRATUM_PROBABILITIES_CALCULATION = 'stratumProbabilities'

export const samplingDesignCalculations = [
    {
        id: STRATUM_AREAS_CALCULATION,
        panel: 'stratification',
        kind: STRATUM_AREAS,
        dependency: STRATUM_FRAME_DEPENDENCY,
        candidate: (recipe, stratification) => ({...recipe.model, stratification}),
        question: model => areaQuestion(model),
        answered: ({stratification}) => Boolean(stratification?.strata?.length),
        batch: ({stratification}) => stratification?.eeStrategy === 'BATCH',
        request$: (question, {batch}) => api.gee.areaPerStratum$({...question, batch, evidence: true}),
        evidenceOf: ({calculatedFrom}) => [calculatedFrom.dependencies[STRATUM_FRAME]],
        status: editedStrataStatus
    },
    {
        id: STRATUM_PROBABILITIES_CALCULATION,
        panel: 'proportions',
        kind: 'SAMPLING_STRATUM_PROBABILITIES',
        dependency: STRATUM_FRAME_DEPENDENCY,
        candidate: (recipe, proportions) => ({...recipe.model, proportions}),
        question: model => probabilityQuestion(model),
        // Rows the planner flagged are answered for strata that have since changed.
        answered: ({proportions}) => Boolean(proportions?.anticipatedProportions?.length) && !proportions.requiresUpdate,
        batch: ({proportions}) => proportions?.eeStrategy === 'BATCH',
        // A stratified design's probabilities group pixels by its strata, so they are calculated over current areas only,
        // and taken only over the frame those areas were calculated from: equal areas and weights say nothing about which
        // pixels belong to each stratum. Whether the probability source itself changed is not evidenced yet.
        operation: STRATUM_PROBABILITIES,
        fits: ({stratumFrameEvidence}, recipe) => !usesStratumAreas(recipe.model)
            || sameFrame(stratumFrameEvidence, recipe.model.stratification.strataCalculatedFrom?.dependencies?.[STRATUM_FRAME]),
        request$: (question, {batch}) => api.gee.probabilityPerStratum$({...question, batch, evidence: true}),
        evidenceOf: ({stratumFrameEvidence}) => [stratumFrameEvidence],
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

// The raw probabilities: the AOI and strata, the probability source and band, its mode and Scale, in the Stratification
// CRS. The percentage interpretation, the overall-proportion override and the weights are applied to the answer.
const probabilityQuestion = ({aoi, stratification = {}, proportions = {}}) => {
    const {skip, manual, anticipationStrategy, type, recipeId, assetId, band, targetClass, scale} = proportions
    const id = type === 'RECIPE' ? recipeId : assetId
    const categorical = anticipationStrategy === 'CATEGORICAL'
    if (skip || isSet(manual) || !id || !band || (categorical && (targetClass == null || targetClass === '')) || !isValidGridScale(scale)) {
        return null
    }
    const stratified = usesStratumAreas({stratification})
    return {
        aoi,
        stratification: stratified
            ? {type: stratification.type === 'RECIPE' ? 'RECIPE_REF' : 'ASSET', id: stratification.type === 'RECIPE' ? stratification.recipeId : stratification.assetId}
            : null,
        stratificationBand: stratification.band,
        probability: {type: type === 'RECIPE' ? 'RECIPE_REF' : 'ASSET', id},
        probabilityBand: band,
        mode: anticipationStrategy,
        targetClass: categorical ? Number(targetClass) : undefined,
        scale,
        crs: stratification.crs || DEFAULT_SAMPLING_GRID_CRS
    }
}

const isSet = value => Array.isArray(value) ? value.length > 0 : Boolean(value)
