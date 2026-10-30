import {calculationState, CURRENT, dependencyState} from '../calculation/freshness.js'
import {assetReference, RECIPE_REF, recipeReference} from '../source/reference.js'
import {isStratificationSkipped} from './stratificationSkip.js'

// What Sampling Design's derived results depend on, declared once for everything judging them: the area and
// probability operations, the task's stages and the GUI's requirements (calculation/freshness.js).
//
// The stratum frame is which pixels belong to which stratum: the stratification product and its selected band, where
// stratified; the AOI, with whatever recipe or table it references; and the Stratification CRS. Areas read it at their
// Scale. Automatic proportions read it with their own probability settings, whose freshness is not evidenced yet, so
// their persisted frame evidence establishes the frame's currency and nothing about the probability source. Equal
// stratum totals or weights never establish that two frames group the same pixels.

export const STRATUM_FRAME = 'SAMPLING_STRATUM_FRAME'
export const STRATUM_FRAME_CONTRACT = 1
export const STRATUM_AREAS = 'SAMPLING_STRATUM_AREAS'
export const STRATUM_AREAS_CONTRACT = 1

// The frame as a design configures it.
export const stratumFrameQuestion = model => {
    const stratification = model?.stratification || {}
    const reference = isStratificationSkipped(stratification) ? null : stratificationReference(stratification)
    return {
        aoi: model?.aoi ?? null,
        stratification: reference ? {reference, band: stratification.band ?? null} : null,
        crs: stratification.crs ?? null
    }
}

// The same frame as an operation is asked for it: its request's AOI, stratification reference, band and CRS.
export const stratumFrameQuestionOf = ({aoi, stratification, band, crs}) => ({
    aoi: aoi ?? null,
    stratification: stratification ? {reference: {type: stratification.type, id: stratification.id}, band: band ?? null} : null,
    crs: crs ?? null
})

// A design whose only sources are the frame's, which the shared dependency graph closes over as it does any design.
export const stratumFrameRoot = ({aoi, stratification}) => ({
    id: 'stratum-frame',
    type: 'SAMPLING_DESIGN',
    model: {
        aoi,
        stratification: stratification
            ? {
                type: stratification.reference.type === RECIPE_REF ? 'RECIPE' : 'ASSET',
                ...(stratification.reference.type === RECIPE_REF
                    ? {recipeId: stratification.reference.id}
                    : {assetId: stratification.reference.id})
            }
            : {skip: true}
    }
})

export const stratumAreasQuestion = model => ({scale: numberOrNull(model?.stratification?.scale)})

export const stratumAreasQuestionOf = ({scale}) => ({scale: numberOrNull(scale)})

// Declared on the recipe type, for whoever acquires current evidence of a design's dependencies.
export const STRATUM_FRAME_DEPENDENCY = {
    id: STRATUM_FRAME,
    contractVersion: STRATUM_FRAME_CONTRACT,
    question: stratumFrameQuestion
}

export const usesStratumAreas = model => !isStratificationSkipped(model?.stratification)

// Proportions anticipated from a probability image, rather than entered or skipped.
export const usesAutomaticProportions = model => {
    const proportions = model?.proportions
    return Boolean(proportions) && !isSet(proportions.skip) && !isSet(proportions.manual)
}

// The design's stratum areas against the frame's current evidence (`currentFrame`, or null while none is acquired):
// CURRENT where it calculates none.
export const strataFreshness = (model, currentFrame) => usesStratumAreas(model)
    ? calculationState({
        recorded: model?.stratification?.strataCalculatedFrom,
        resource: {id: STRATUM_AREAS, contractVersion: STRATUM_AREAS_CONTRACT},
        question: stratumAreasQuestion(model),
        dependencies: {[STRATUM_FRAME]: frameDependency(model, currentFrame)}
    })
    : CURRENT

// Automatic proportions' frame against its current evidence: CURRENT where none were calculated, or none apply.
export const proportionsFrameFreshness = (model, currentFrame) =>
    usesAutomaticProportions(model) && model.proportions.anticipatedProportions?.length
        ? dependencyState({recorded: model.proportions.stratumFrameEvidence, ...frameDependency(model, currentFrame)})
        : CURRENT

// Whether two pieces of frame evidence say the same pixels belong to the same strata, read at whatever revisions.
export const sameFrame = (a, b) => Boolean(a?.digest) && a.digest === b?.digest && a.contractVersion === b?.contractVersion

const frameDependency = (model, current) => ({
    contractVersion: STRATUM_FRAME_CONTRACT,
    question: stratumFrameQuestion(model),
    current
})

const stratificationReference = ({type, recipeId, assetId}) => {
    if (type === 'RECIPE') {
        return recipeId ? recipeReference(recipeId) : null
    }
    return type === 'ASSET' && assetId ? assetReference(assetId) : null
}

const numberOrNull = value => value === null || value === undefined || value === '' ? null : Number(value)

// `skip` and `manual` are saved as the forms' toggles: a list, or a flag in older models.
const isSet = value => Array.isArray(value) ? value.length > 0 : Boolean(value)
