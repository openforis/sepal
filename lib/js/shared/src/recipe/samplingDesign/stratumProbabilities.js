import {calculationState, CURRENT, dependencyState} from '../calculation/freshness.js'
import {frameDependency, sourceReferenceOf, STRATUM_FRAME, stratumFrameRoot, usesAutomaticProportions} from './stratumFrame.js'

// What automatic proportions are calculated from, declared once for the probability operation, the task's admission and
// the GUI's requirements (calculation/freshness.js): the raw probability per stratum, read over the stratum frame
// (stratumFrame.js), composed unchanged, and over the probability source - the product and band the proportions select.
// The result's own question is the mode, the target class where categorical, and the Proportions Scale; the contract
// version covers the reduction (weightedAreaSums.js, areaWeightedProportions.js). The percentage interpretation, the
// overall-proportion override and the weights are applied to the answer, so none of them is asked, and neither is
// whether it is calculated online or as a batch task.
//
// Proportions a client of the previous release calculated carry `stratumFrameEvidence`, which that client's Apply wrote
// whether or not it held any, and kept beside whatever else the record held: evidence a newer client recorded for other
// values. Where the property is saved, null included, the record's evidence is not taken as theirs.

export const PROBABILITY_SOURCE = 'SAMPLING_PROBABILITY_SOURCE'
export const PROBABILITY_SOURCE_CONTRACT = 1
export const STRATUM_PROBABILITIES = 'SAMPLING_STRATUM_PROBABILITIES'
export const STRATUM_PROBABILITIES_CONTRACT = 1

const LEGACY_FRAME_EVIDENCE = 'stratumFrameEvidence'

// The probability source as a design configures it: null where proportions are not anticipated from one, or none is
// selected yet, and nothing is read for it.
export const probabilitySourceQuestion = model => {
    const proportions = model?.proportions
    const reference = usesAutomaticProportions(model) ? sourceReferenceOf(proportions) : null
    return reference && proportions.band ? {reference, band: proportions.band} : null
}

// The same source as an operation is asked for it: its request's probability reference and band.
export const probabilitySourceQuestionOf = ({probability, probabilityBand}) => ({
    reference: {type: probability.type, id: probability.id},
    band: probabilityBand ?? null
})

// A design whose only source is the probability product, closed over as the frame's is.
export const probabilitySourceRoot = ({reference}) => ({
    ...stratumFrameRoot({aoi: null, stratification: {reference}}),
    id: 'probability-source'
})

// Declared on the recipe type, beside the frame, for whoever acquires current evidence of a design's dependencies.
export const PROBABILITY_SOURCE_DEPENDENCY = {
    id: PROBABILITY_SOURCE,
    contractVersion: PROBABILITY_SOURCE_CONTRACT,
    question: probabilitySourceQuestion
}

export const stratumProbabilitiesQuestion = model => {
    const {anticipationStrategy, targetClass, scale} = model?.proportions || {}
    return stratumProbabilitiesQuestionOf({mode: anticipationStrategy, targetClass, scale})
}

// As the operation reads its request: PROBABILITY where no mode is given, a target class only in CATEGORICAL mode.
export const stratumProbabilitiesQuestionOf = ({mode, targetClass, scale}) => {
    const asked = mode || 'PROBABILITY'
    return {
        mode: asked,
        targetClass: asked === 'CATEGORICAL' ? numberOrNull(targetClass) : null,
        scale: numberOrNull(scale)
    }
}

// Automatic proportions against the current evidence of what they read (`current`, {[dependency]: evidence}, each
// absent while none is acquired): CURRENT where none were calculated, or none apply.
export const proportionsFreshness = (model, current = {}) =>
    calculatedProportions(model)
        ? calculationState({
            recorded: recordedEvidence(model.proportions),
            resource: {id: STRATUM_PROBABILITIES, contractVersion: STRATUM_PROBABILITIES_CONTRACT},
            question: stratumProbabilitiesQuestion(model),
            dependencies: {
                [STRATUM_FRAME]: frameDependency(model, current[STRATUM_FRAME] ?? null),
                [PROBABILITY_SOURCE]: {
                    contractVersion: PROBABILITY_SOURCE_CONTRACT,
                    question: probabilitySourceQuestion(model),
                    current: current[PROBABILITY_SOURCE] ?? null
                }
            }
        })
        : CURRENT

// The frame alone of the proportions a task was admitted with, which its later stages read again: what they recorded
// it as, or, for a task admitted before full evidence was recorded, the frame evidence saved in its place.
export const admittedProportionsFrameFreshness = (model, currentFrame) =>
    calculatedProportions(model)
        ? dependencyState({
            recorded: hasLegacyFrameEvidence(model.proportions)
                ? model.proportions[LEGACY_FRAME_EVIDENCE]
                : model.proportions.probabilityPerStratumCalculatedFrom?.dependencies?.[STRATUM_FRAME],
            ...frameDependency(model, currentFrame)
        })
        : CURRENT

const calculatedProportions = model => usesAutomaticProportions(model) && Boolean(model.proportions.anticipatedProportions?.length)

const recordedEvidence = proportions =>
    hasLegacyFrameEvidence(proportions) ? null : proportions.probabilityPerStratumCalculatedFrom

// Saved, null included: a property absent from a persisted record is undefined, as one never written is.
const hasLegacyFrameEvidence = proportions => proportions[LEGACY_FRAME_EVIDENCE] !== undefined

const numberOrNull = value => value === null || value === undefined || value === '' ? null : Number(value)
