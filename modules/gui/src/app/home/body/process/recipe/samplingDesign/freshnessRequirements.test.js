import {describe, expect, it, vi} from 'vitest'

import {stratumFrameQuestion} from '#sepal/recipe/samplingDesign/stratumFrame'

// What a design's sections still need, as the requirement readers read them: Retrieve, the Proportions panel's
// calculation and the sections the toolbar marks, as unfinished or wrong. The current frame evidence is what the source
// runtime publishes on the design (calculationEvidence.js); the recipe type registry is substituted.

vi.mock('~/translate', () => ({msg: (key, values) => values?.message || key}))
vi.mock('~/app/home/body/process/recipeTypeRegistry', () => ({getRecipeType: () => ({sourceRequirements: requirements})}))

const {samplingDesignRequirements: requirements, SAMPLES, samplesGate, samplesGateMessage, STRATUM_PROBABILITIES} = await import('./freshnessRequirements')
const {requestGate} = await import('../sourceRequirements')
const {sectionProblemsOfState} = await import('../selectedSourceStatus')

const FRAME = 'SAMPLING_STRATUM_FRAME'
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
        const design = withCurrent(withProportions(withAreas(stratified(), frame({digest: 'a'})), frame({digest: 'old'})), observed(frame({digest: 'a'})))

        expect(samplesGateMessage(gateOf(design))).toBe('process.samplingDesign.sectionStatus.proportions.STALE')
    })

    it('of an unstratified design needs no area evidence, only its proportions\' frame', () => {
        const unstratifiedFrame = frame({digest: 'aoi', model: unstratified()})
        const design = withCurrent(withProportions(unstratified(), unstratifiedFrame), observed(unstratifiedFrame))

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
        const flaggedDesign = flagged(withStrategy(withAreas(stratified(), frame({digest: 'a'})), 'BALANCED'), 'sampleAllocation')
        const proportionsOver = evidence => withProportions(flaggedDesign, evidence)

        expect(marks(withCurrent(proportionsOver(frame({digest: 'a'})), observed(frame({digest: 'b'})))))
            .toEqual({stratification: 'error'})
        expect(marks(withCurrent(withAreas(proportionsOver(frame({digest: 'a'})), frame({digest: 'b'})), observed(frame({digest: 'b'})))))
            .toEqual({proportions: 'error'})
        expect(marks(withCurrent(withAreas(proportionsOver(frame({digest: 'b'})), frame({digest: 'b'})), observed(frame({digest: 'b'})))))
            .toEqual({sampleAllocation: 'error'})
    })

    it('with stale areas, are stratification alone, as wrong, while what reads the areas waits', () => {
        const design = withCurrent(
            flagged(withProportions(withAreas(stratified(), frame({digest: 'a'})), frame({digest: 'a'})), 'proportions', 'sampleAllocation'),
            observed(frame({digest: 'b'}))
        )

        expect(marks(design)).toEqual({stratification: 'error'})
    })

    it('with areas saved without evidence, are stratification, as unfinished: it is calculated once when opened', () => {
        const design = withCurrent(withProportions(stratified(), frame({digest: 'a'})), observed(frame({digest: 'a'})))

        expect(marks(design)).toEqual({stratification: 'incomplete'})
    })

    it('with proportions skipped, are a flagged allocation, without waiting on them', () => {
        const design = withCurrent(withoutProportions(flagged(withAreas(stratified(), frame({digest: 'a'})), 'sampleAllocation')), observed(frame({digest: 'a'})))

        expect(marks(design)).toEqual({sampleAllocation: 'error'})
    })

    it('keep what does not wait on stale areas', () => {
        const design = withCurrent(flagged(withAreas(stratified(), frame({digest: 'a'})), 'sampleArrangement'), observed(frame({digest: 'b'})))

        expect(marks(design)).toEqual({stratification: 'error', sampleArrangement: 'error'})
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

const withProportions = (design, evidence) => ({
    ...design,
    model: {...design.model, proportions: {anticipatedProportions: [{stratum: 1, proportion: 0.5}], stratumFrameEvidence: evidence}}
})

const withoutStrata = design => ({
    ...design,
    model: {...design.model, stratification: {...design.model.stratification, strata: undefined}, sampleAllocation: {allocationStrategy: 'BALANCED', allocation: []}}
})

// As the planner leaves a design whose strata were just calculated: nothing anticipated or allocated yet, both flagged.
const justStratified = (design, allocation) => ({
    ...design,
    model: {...design.model, proportions: {requiresUpdate: true}, sampleAllocation: {...allocation, requiresUpdate: true, allocation: []}}
})

const withoutProportions = design => ({...design, model: {...design.model, proportions: {skip: true}}})

const flagged = (design, ...sections) => ({
    ...design,
    model: {...design.model, ...Object.fromEntries(sections.map(section => [section, {...design.model[section], requiresUpdate: true}]))}
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

const withCurrent = (design, entry) => ({...design, ui: {dependencyEvidence: {[FRAME]: {question: stratumFrameQuestion(design.model), ...entry}}}})

const stateOf = design => ({process: {loadedRecipes: {[design.id]: design}, recipes: [], tabs: []}})

const gateOf = design => requestGate({state: stateOf(design), recipe: design, operation: SAMPLES, now: 0})
