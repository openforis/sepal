import {describe, expect, it, vi} from 'vitest'

import {allocationReviewInputs} from '#sepal/recipe/samplingDesign/allocationReview'
import {stratumFrameQuestion} from '#sepal/recipe/samplingDesign/stratumFrame'
import {probabilitySourceQuestion, stratumProbabilitiesQuestion} from '#sepal/recipe/samplingDesign/stratumProbabilities'

// What a design's sections still need, as the requirement readers read them: Retrieve, the Proportions panel's
// calculation and the sections the toolbar marks, as unfinished or wrong. The current evidence of the frame and the
// probability source is what the source runtime publishes on the design (calculationEvidence.js); the recipe type
// registry is substituted.

vi.mock('~/translate', () => ({msg: (key, values) => values?.message || key}))
vi.mock('~/app/home/body/process/recipeTypeRegistry', () => ({getRecipeType: () => ({sourceRequirements: requirements})}))

const {samplingDesignRequirements: requirements, SAMPLES, samplesGate, samplesGateMessage, STRATUM_PROBABILITIES} = await import('./freshnessRequirements')
const {requestGate} = await import('../sourceRequirements')
const {sectionProblemsOfState} = await import('../selectedSourceStatus')

const FRAME = 'SAMPLING_STRATUM_FRAME'
const PROBABILITY = 'SAMPLING_PROBABILITY_SOURCE'
const AUTHORITY_MS = 300000

describe('Retrieve of a design', () => {
    it('waits while the stratum frame is being checked', () => {
        const design = withCurrent(withAreas(stratified(), frame({digest: 'a'})), {status: 'PENDING'})

        expect(gateOf(design)).toMatchObject({wait: true, code: 'SOURCE_PENDING'})
    })

    it('is unavailable while the frame could not be checked', () => {
        const design = withCurrent(withAreas(stratified(), frame({digest: 'a'})), {status: 'FAILED'})

        expect(gateOf(design)).toMatchObject({wait: false, code: 'SOURCE_UNAVAILABLE'})
    })

    it.each([
        ['changed', 'STALE', design => withCurrent(withAreas(design, frame({digest: 'a'})), observed(frame({digest: 'b'})))],
        ['without evidence', 'UNKNOWN', design => withCurrent(design, observed(frame({digest: 'a'})))],
        ['over a source without a token', 'UNVERSIONED', design => withCurrent(withAreas(design, frame({digest: 'a', unversioned: ['gs://b/s.tif']})), observed(frame({digest: 'a', unversioned: ['gs://b/s.tif']})))]
    ])('is held for areas %s, saying what repairs them', (_name, state, arrange) => {
        const gate = gateOf(arrange(stratified()))

        expect(gate.code).toBe('CONFIGURATION_UNMET')
        expect(samplesGateMessage(gate)).toBe(`process.samplingDesign.sectionStatus.stratification.${state}`)
    })

    it('is not held for areas calculated at an older revision over the same frame', () => {
        const design = withCurrent(withAreas(stratified(), frame({digest: 'a', revision: 7})), observed(frame({digest: 'a', revision: 8})))

        expect(gateOf(design)).toBe(null)
    })

    it('is held for automatic proportions over another frame, whatever the areas say', () => {
        const design = withCurrent(withProportions(withAreas(stratified(), frame({digest: 'a'})), {frame: frame({digest: 'old'})}), observed(frame({digest: 'a'})))

        expect(samplesGateMessage(gateOf(design))).toBe('process.samplingDesign.sectionStatus.proportions.STALE')
    })

    it('is held for automatic proportions once their probability source changed, though the frame did not', () => {
        const calculated = withProportions(withAreas(stratified(), frame({digest: 'a'})), {frame: frame({digest: 'a'})})
        const design = withCurrent(calculated, observed(frame({digest: 'a'})), observed(source({digest: 'changed', design: calculated})))

        expect(samplesGateMessage(gateOf(design))).toBe('process.samplingDesign.sectionStatus.proportions.STALE')
    })

    it('waits while the probability source is being checked', () => {
        const calculated = withProportions(withAreas(stratified(), frame({digest: 'a'})), {frame: frame({digest: 'a'})})
        const design = withCurrent(calculated, observed(frame({digest: 'a'})), {status: 'PENDING'})

        expect(gateOf(design)).toMatchObject({wait: true, code: 'SOURCE_PENDING'})
    })

    it('is held for proportions saved with frame evidence alone, saying they are calculated once', () => {
        const areas = withAreas(stratified(), frame({digest: 'a'}))
        const legacy = {...areas, model: {...areas.model, proportions: {...automatic(), stratumFrameEvidence: frame({digest: 'a'})}}}

        expect(samplesGateMessage(gateOf(withCurrent(legacy, observed(frame({digest: 'a'}))))))
            .toBe('process.samplingDesign.sectionStatus.proportions.UNKNOWN')
    })

    it('of an unstratified design needs no area evidence, only what its proportions read', () => {
        const unstratifiedFrame = frame({digest: 'aoi', model: unstratified()})
        const design = withCurrent(withProportions(unstratified(), {frame: unstratifiedFrame}), observed(unstratifiedFrame))

        expect(gateOf(design)).toBe(null)
        expect(samplesGate(design, 0)).toBe(null)
    })

    it('is out of date once the frame\'s evidence is older than its authority, whether or not it was read again', () => {
        const design = withCurrent(withAreas(stratified(), frame({digest: 'a'})), observed(frame({digest: 'a'})))

        expect(requestGate({state: stateOf(design), recipe: design, operation: SAMPLES, now: AUTHORITY_MS - 1})).toBe(null)
        expect(requestGate({state: stateOf(design), recipe: design, operation: SAMPLES, now: AUTHORITY_MS}))
            .toMatchObject({wait: false, code: 'SOURCE_EXPIRED'})
        expect(samplesGate(design, AUTHORITY_MS)).toMatchObject({code: 'SOURCE_EXPIRED'})
    })
})

describe('the Proportions calculation', () => {
    it('is held while a stratified design\'s areas are not current', () => {
        const design = withCurrent(withAreas(stratified(), frame({digest: 'a'})), observed(frame({digest: 'b'})))

        expect(requestGate({state: stateOf(design), recipe: design, operation: STRATUM_PROBABILITIES, now: 0})).not.toBe(null)
    })

    it('of an unstratified design is never held by areas', () => {
        const design = withCurrent(unstratified(), observed(frame({digest: 'aoi', model: unstratified()})))

        expect(requestGate({state: stateOf(design), recipe: design, operation: STRATUM_PROBABILITIES, now: 0})).toBe(null)
    })
})

describe('the sections a design marks', () => {
    it('before it is stratified, are stratification, as unfinished, and none of the sections waiting on it', () => {
        const design = withCurrent(withoutStrata(stratified()), observed(frame({digest: 'a'})))

        expect(marks(design)).toEqual({stratification: 'incomplete'})
    })

    it.each([
        ['a Balanced', {allocationStrategy: 'BALANCED'}],
        ['an Optimal', {allocationStrategy: 'OPTIMAL'}],
        ['a manual', {manual: [true]}]
    ])('once stratified, are proportions, as unfinished, while %s allocation waits on them', (_name, allocation) => {
        const design = withCurrent(justStratified(withAreas(stratified(), frame({digest: 'a'})), allocation), observed(frame({digest: 'a'})))

        expect(marks(design)).toEqual({proportions: 'incomplete'})
    })

    it('once stratified with proportions skipped, are the allocation, as unfinished', () => {
        const design = withCurrent(
            withoutProportions(justStratified(withAreas(stratified(), frame({digest: 'a'})), {allocationStrategy: 'BALANCED'})),
            observed(frame({digest: 'a'}))
        )

        expect(marks(design)).toEqual({sampleAllocation: 'incomplete'})
    })

    it('move from stratification to proportions to the allocation, as each is repaired', () => {
        const reviewedBeforeProportions = reviewed(withStrategy(withAreas(stratified(), frame({digest: 'a'})), 'BALANCED'))
        const proportionsOver = evidence => withProportions(reviewedBeforeProportions, {frame: evidence})

        expect(marks(withCurrent(proportionsOver(frame({digest: 'a'})), observed(frame({digest: 'b'})))))
            .toEqual({stratification: 'error'})
        expect(marks(withCurrent(withAreas(proportionsOver(frame({digest: 'a'})), frame({digest: 'b'})), observed(frame({digest: 'b'})))))
            .toEqual({proportions: 'error'})
        expect(marks(withCurrent(withAreas(proportionsOver(frame({digest: 'b'})), frame({digest: 'b'})), observed(frame({digest: 'b'})))))
            .toEqual({sampleAllocation: 'error'})
    })

    it('after a probability-only change, are proportions alone, as wrong, while the allocation waits on them', () => {
        const calculated = withProportions(withStrategy(withAreas(stratified(), frame({digest: 'a'})), 'BALANCED'), {frame: frame({digest: 'a'})})

        expect(marks(withCurrent(calculated, observed(frame({digest: 'a'})), observed(source({digest: 'changed', design: calculated})))))
            .toEqual({proportions: 'error'})
    })

    it('for new strata over an unchanged frame, are automatic proportions, whose rows no longer cover them', () => {
        const calculated = withProportions(withStrategy(withAreas(stratified(), frame({digest: 'a'})), 'BALANCED'), {frame: frame({digest: 'a'})})
        const restratified = {...calculated, model: {...calculated.model, stratification: {...calculated.model.stratification, strata: [{value: 2, area: 100, weight: 1}]}}}

        expect(marks(withCurrent(restratified, observed(frame({digest: 'a'}))))).toEqual({proportions: 'error'})
    })

    it('with stale areas, are stratification alone, as wrong, while what reads the areas waits', () => {
        const design = withCurrent(
            flagged(withProportions(withAreas(stratified(), frame({digest: 'a'})), {frame: frame({digest: 'a'})}), 'proportions', 'sampleAllocation'),
            observed(frame({digest: 'b'}))
        )

        expect(marks(design)).toEqual({stratification: 'error'})
    })

    it('with areas saved without evidence, are stratification, as unfinished: it is calculated once when opened', () => {
        const design = withCurrent(withProportions(stratified(), {frame: frame({digest: 'a'})}), observed(frame({digest: 'a'})))

        expect(marks(design)).toEqual({stratification: 'incomplete'})
    })

    it('with proportions skipped, are an allocation reviewed for other weights, as wrong, without waiting on them', () => {
        const allocated = reviewed(withoutProportions(withStrategy(withAreas(stratified(), frame({digest: 'a'})), 'BALANCED')))
        const design = withCurrent(withStrata(allocated, [{value: 1, area: 100, weight: 0.5}]), observed(frame({digest: 'a'})))

        expect(marks(design)).toEqual({sampleAllocation: 'error'})
    })

    it.each([
        ['saved without a record of what it was reviewed for', design => design],
        ['an earlier version last applied, its flag false, though the record reads as the design does', design => withFlag(reviewed(design), 'sampleAllocation', false)]
    ])('with proportions skipped, are an allocation %s, as unfinished: it is reviewed once', (_name, as) => {
        const design = withCurrent(as(withoutProportions(withAreas(stratified(), frame({digest: 'a'})))), observed(frame({digest: 'a'})))

        expect(marks(design)).toEqual({sampleAllocation: 'incomplete'})
    })

    it('with proportions skipped, are none for an allocation reviewed for the design as it is', () => {
        const design = withCurrent(reviewed(withoutProportions(withAreas(stratified(), frame({digest: 'a'})))), observed(frame({digest: 'a'})))

        expect(marks(design)).toEqual({})
    })

    it('keep what does not wait on stale areas', () => {
        const design = withCurrent(flagged(withAreas(stratified(), frame({digest: 'a'})), 'sampleArrangement'), observed(frame({digest: 'b'})))

        expect(marks(design)).toEqual({stratification: 'error', sampleArrangement: 'error'})
    })

    it.each([
        ['the form\'s toggle', [true]],
        ['an earlier version\'s flag', true]
    ])('with manual answers, saved as %s, for strata the design no longer has, are proportions, as wrong', (_name, manual) => {
        const design = withCurrent(withManualProportions(withAreas(stratified(), frame({digest: 'a'})), [{stratum: 2, proportion: 0.5}], {manual}), observed(frame({digest: 'a'})))

        expect(marks(design)).toEqual({proportions: 'error'})
    })

    it('with manual answers for strata the design no longer has, saved with an empty skip toggle, are proportions, as wrong', () => {
        const answered = withManualProportions(withAreas(stratified(), frame({digest: 'a'})), [{stratum: 2, proportion: 0.5}])
        const design = withCurrent({...answered, model: {...answered.model, proportions: {...answered.model.proportions, skip: []}}}, observed(frame({digest: 'a'})))

        expect(marks(design)).toEqual({proportions: 'error'})
    })

    it('with manual answers kept by stratum as the strata are reordered, are none of the proportions', () => {
        const strata = [{value: 1, area: 100, weight: 0.5}, {value: 2, area: 100, weight: 0.5}]
        const answered = withManualProportions(withStrata(withAreas(stratified(), frame({digest: 'a'})), strata), [{stratum: 2, proportion: 0.5}, {stratum: 1, proportion: 0.2}])

        expect(marks(withCurrent(answered, observed(frame({digest: 'a'}))))).not.toHaveProperty('proportions')
    })

    it('with manual answers for every stratum an earlier version flagged, are proportions, as wrong, until they are applied', () => {
        const design = withCurrent(
            withManualProportions(withAreas(stratified(), frame({digest: 'a'})), [{stratum: 1, proportion: 0.5}], {requiresUpdate: true}),
            observed(frame({digest: 'a'}))
        )

        expect(marks(design)).toEqual({proportions: 'error'})
    })

    it('are none while the frame is still being checked', () => {
        const design = withCurrent(withAreas(stratified(), frame({digest: 'a'})), {status: 'PENDING'})

        expect(marks(design)).toEqual({})
    })
})

const stratified = () => recipe({
    aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1], [0, 0]]},
    stratification: {type: 'RECIPE', recipeId: 'classification-1', band: 'class', crs: 'EPSG:6933', scale: 30, strata: [{value: 1, area: 100, weight: 1}]},
    sampleAllocation: {allocationStrategy: 'OPTIMAL', allocation: [{stratum: 1, sampleSize: 30}]}
})

const unstratified = () => recipe({
    aoi: {type: 'RECIPE', id: 'aoi-recipe'},
    stratification: {skip: true, crs: 'EPSG:6933', strata: [{value: 1, weight: 1}]},
    sampleAllocation: {allocationStrategy: 'EQUAL', allocation: [{stratum: 1, sampleSize: 30}]}
})

const recipe = model => ({id: 'design-1', type: 'SAMPLING_DESIGN', model, ui: {}})

const frame = ({digest, revision = 1, unversioned = [], model = stratified()}) => ({
    dependency: FRAME,
    contractVersion: 1,
    question: stratumFrameQuestion(model.model),
    digest,
    provenance: {recipes: [{id: 'classification-1', revision}], assets: []},
    unversioned
})

const withAreas = (design, evidence) => ({
    ...design,
    model: {
        ...design.model,
        stratification: {
            ...design.model.stratification,
            strataCalculatedFrom: {
                resource: {id: 'SAMPLING_STRATUM_AREAS', contractVersion: 1},
                question: {scale: 30},
                dependencies: {[FRAME]: evidence}
            }
        }
    }
})

const automatic = () => ({
    anticipationStrategy: 'PROBABILITY', type: 'RECIPE', recipeId: 'probability-1', band: 'probability', scale: 30,
    anticipatedProportions: [{stratum: 1, proportion: 0.5}]
})

// The probability source's evidence as an operation returns it for the design's proportions.
const source = ({digest = 'p', design}) => ({
    dependency: PROBABILITY,
    contractVersion: 1,
    question: probabilitySourceQuestion(design.model),
    digest,
    provenance: {recipes: [{id: 'probability-1', revision: 1}], assets: []},
    unversioned: []
})

// Automatic proportions as the probability operation saves them, over `frame` and the probability source as it reads.
const withProportions = (design, {frame}) => {
    const model = {...design.model, proportions: automatic()}
    const calculatedFrom = {
        resource: {id: 'SAMPLING_STRATUM_PROBABILITIES', contractVersion: 1},
        question: stratumProbabilitiesQuestion(model),
        dependencies: {[FRAME]: frame, [PROBABILITY]: source({design: {model}})}
    }
    return {...design, model: {...model, proportions: {...model.proportions, probabilityPerStratumCalculatedFrom: calculatedFrom}}}
}

const withoutStrata = design => ({
    ...design,
    model: {...design.model, stratification: {...design.model.stratification, strata: undefined}, sampleAllocation: {allocationStrategy: 'BALANCED', allocation: []}}
})

// A design whose strata were just calculated: nothing anticipated or allocated yet.
const justStratified = (design, allocation) => ({
    ...design,
    model: {...design.model, proportions: {}, sampleAllocation: {...allocation, allocation: []}}
})

const withoutProportions = design => ({...design, model: {...design.model, proportions: {skip: true}}})

const flagged = (design, ...sections) => ({
    ...design,
    model: {...design.model, ...Object.fromEntries(sections.map(section => [section, {...design.model[section], requiresUpdate: true}]))}
})

const withFlag = (design, section, requiresUpdate) => ({
    ...design,
    model: {...design.model, [section]: {...design.model[section], requiresUpdate}}
})

// The allocation as the Allocation panel applies it: with the record of what it was reviewed for.
const reviewed = design => ({
    ...design,
    model: {...design.model, sampleAllocation: {...design.model.sampleAllocation, reviewedInputs: allocationReviewInputs(design.model)}}
})

const withStrata = (design, strata) => ({
    ...design,
    model: {...design.model, stratification: {...design.model.stratification, strata}}
})

// Proportions entered by hand, `manual` as the form's toggle or an earlier version's flag, for the strata the rows name.
const withManualProportions = (design, rows, {manual = [true], requiresUpdate} = {}) => ({
    ...design,
    model: {...design.model, proportions: {manual, anticipatedProportions: rows, ...requiresUpdate !== undefined && {requiresUpdate}}}
})

const withStrategy = (design, allocationStrategy) => ({
    ...design,
    model: {...design.model, sampleAllocation: {...design.model.sampleAllocation, allocationStrategy}}
})

// Each section marked, as unfinished or wrong.
const marks = design => {
    const {sourceProblems, incompleteSections} = sectionProblemsOfState(stateOf(design), design.id, null, 0)
    return Object.fromEntries(Object.keys(sourceProblems).map(section => [section, incompleteSections[section] ? 'incomplete' : 'error']))
}

const observed = evidence => ({status: 'OBSERVED', question: evidence.question, evidence, observedAt: 0})

// What the source runtime publishes: the frame as given, and the probability source, where the design asks one, as it
// was calculated unless given.
const withCurrent = (design, frameEntry, probabilityEntry = observed(source({design}))) => {
    const probabilityQuestion = probabilitySourceQuestion(design.model)
    return {
        ...design,
        ui: {
            dependencyEvidence: {
                [FRAME]: {question: stratumFrameQuestion(design.model), ...frameEntry},
                ...probabilityQuestion && {[PROBABILITY]: {question: probabilityQuestion, ...probabilityEntry}}
            }
        }
    }
}

const stateOf = design => ({process: {loadedRecipes: {[design.id]: design}, recipes: [], tabs: []}})

const gateOf = design => requestGate({state: stateOf(design), recipe: design, operation: SAMPLES, now: 0})
