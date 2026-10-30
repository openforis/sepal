import {beforeEach, describe, expect, it, vi} from 'vitest'

const {publishEvent, submit$, subscribe, notifyError, isGoogleAccount, select} = vi.hoisted(() => ({
    publishEvent: vi.fn(),
    subscribe: vi.fn(),
    submit$: vi.fn(() => ({subscribe: vi.fn()})),
    notifyError: vi.fn(),
    isGoogleAccount: vi.fn(),
    select: vi.fn()
}))
submit$.mockReturnValue({subscribe})

vi.mock('~/eventPublisher', () => ({publishEvent}))
vi.mock('~/apiRegistry', () => ({default: {tasks: {submit$}}}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: notifyError}}))
vi.mock('~/user', () => ({isGoogleAccount}))
vi.mock('~/store', () => ({select}))
vi.mock('~/translate', () => ({msg: (key, args) => args ? `${key}:${JSON.stringify(args)}` : key}))
vi.mock('~/app/home/body/process/recipe', () => ({recipeActionBuilder: () => ({})}))
vi.mock('~/app/home/body/process/recipe/recipeOutputPath', () => ({getTaskInfo: () => ({})}))
vi.mock('~/app/home/body/process/recipeTypeRegistry', () => ({getRecipeType: () => ({sourceRequirements: requirements})}))

const {submitRetrieveRecipeTask} = await import('./samplingDesignRecipe')
const {samplingDesignRequirements: requirements} = await import('./freshnessRequirements')
const {stratumFrameQuestion} = await import('#sepal/recipe/samplingDesign/stratumFrame')

const FRAME = 'SAMPLING_STRATUM_FRAME'

// Frame evidence as an operation returns it, and the design with it published as current (calculationEvidence.js).
const frameOf = model => ({
    dependency: FRAME, contractVersion: 1, question: stratumFrameQuestion(model), digest: 'frame',
    provenance: {recipes: [], assets: [{id: 'users/x/strata', version: 't1'}]}, unversioned: []
})
const withCurrentFrame = (recipe, observedAt = Date.now()) => ({
    ...recipe,
    ui: {...recipe.ui, dependencyEvidence: {[FRAME]: {status: 'OBSERVED', question: stratumFrameQuestion(recipe.model), evidence: frameOf(recipe.model), observedAt}}}
})
const withAreaEvidence = recipe => ({
    ...recipe,
    model: {
        ...recipe.model,
        stratification: {
            ...recipe.model.stratification,
            strataCalculatedFrom: {
                resource: {id: 'SAMPLING_STRATUM_AREAS', contractVersion: 1},
                question: {scale: recipe.model.stratification.scale ?? null},
                dependencies: {[FRAME]: frameOf(recipe.model)}
            }
        }
    }
})

const designOf = model => ({
    id: 'r1', type: 'SAMPLING_DESIGN', title: 'Design', placeholder: 'Design',
    model,
    ui: {retrieveOptions: {destination: 'SEPAL'}}
})

const savedWithoutEvidence = designOf({
    aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1], [0, 0]]},
    stratification: {type: 'ASSET', assetId: 'users/x/strata', band: 'class', crs: 'EPSG:6933', scale: 30, strata: [{value: 1, label: 'Forest', color: '#0a0', area: 3e8, weight: 1}]},
    proportions: {skip: true},
    sampleAllocation: {
        manual: [true], allocationStrategy: 'EQUAL',
        allocation: [{stratum: 1, label: 'Forest', color: '#0a0', area: 3e8, weight: 1, sampleSize: 30}]
    },
    sampleArrangement: {arrangementStrategy: 'RANDOM', seed: 1}
})

// The design as it is submitted once its areas were calculated and the frame they read is unchanged.
const recipe = withCurrentFrame(withAreaEvidence(savedWithoutEvidence))

describe('Sampling Design retrieve submission', () => {
    beforeEach(() => vi.clearAllMocks())

    it('does not publish while asset roots are still loading (pending), and notifies', () => {
        submitRetrieveRecipeTask(recipe, {googleAccount: true, assetRoots: undefined})
        expect(notifyError).toHaveBeenCalledTimes(1)
        expect(notifyError.mock.calls[0][0].error).toContain('pending')
        expect(publishEvent).not.toHaveBeenCalled()
        expect(submit$).not.toHaveBeenCalled()
    })

    it('refuses a design whose areas were saved without calculation evidence, saying to calculate them once', () => {
        submitRetrieveRecipeTask(withCurrentFrame(savedWithoutEvidence), {googleAccount: true, assetRoots: ['users/me']})

        expect(notifyError).toHaveBeenCalledTimes(1)
        expect(notifyError.mock.calls[0][0]).toMatchObject({
            message: 'process.samplingDesign.retrieve.freshness.title',
            error: 'process.samplingDesign.sectionStatus.stratification.UNKNOWN'
        })
        expect(submit$).not.toHaveBeenCalled()
    })

    it('refuses a design whose frame evidence outlived its authority before the runtime read it again', () => {
        const expired = withCurrentFrame(withAreaEvidence(savedWithoutEvidence), Date.now() - 300001)

        submitRetrieveRecipeTask(expired, {googleAccount: true, assetRoots: ['users/me']})

        expect(notifyError.mock.calls[0][0]).toMatchObject({
            message: 'process.samplingDesign.retrieve.freshness.title',
            error: 'process.samplingDesign.retrieve.evidence.SOURCE_EXPIRED'
        })
        expect(submit$).not.toHaveBeenCalled()
    })

    it('submits an unstratified design whose automatic proportions are current, with no area evidence', () => {
        const unstratified = {
            ...savedWithoutEvidence.model,
            stratification: {skip: true, crs: 'EPSG:6933', strata: [{value: 1, label: 'All', color: '#000', weight: 1}]},
            sampleAllocation: {manual: [true], allocationStrategy: 'EQUAL', allocation: [{stratum: 1, sampleSize: 30}]}
        }
        const design = withCurrentFrame(designOf({
            ...unstratified,
            proportions: {anticipatedProportions: [{stratum: 1, proportion: 0.5}], stratumFrameEvidence: frameOf(unstratified)}
        }))

        submitRetrieveRecipeTask(design, {googleAccount: true, assetRoots: ['users/me']})

        expect(notifyError).not.toHaveBeenCalled()
        expect(submit$).toHaveBeenCalledTimes(1)
        expect(JSON.stringify(publishEvent.mock.calls[0][1])).not.toMatch(/stratumFrameEvidence|strataCalculatedFrom/)
    })

    it('publishes and submits when linked with a loaded, non-empty root list', () => {
        submitRetrieveRecipeTask(recipe, {googleAccount: true, assetRoots: ['users/me']})
        expect(notifyError).not.toHaveBeenCalled()
        expect(publishEvent).toHaveBeenCalledWith('submit_task', expect.objectContaining({recipe_type: 'SAMPLING_DESIGN'}))
        expect(submit$).toHaveBeenCalledTimes(1)
    })
})
