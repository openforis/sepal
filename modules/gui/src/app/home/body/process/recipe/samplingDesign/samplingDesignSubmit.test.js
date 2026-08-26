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

const {submitRetrieveRecipeTask} = await import('./samplingDesignRecipe')

const recipe = {
    id: 'r1', type: 'SAMPLING_DESIGN', title: 'Design', placeholder: 'Design',
    model: {
        stratification: {strata: [{value: 1, label: 'Forest', color: '#0a0', area: 3e8, weight: 1}]},
        proportions: {skip: true},
        sampleAllocation: {
            manual: [true], allocationStrategy: 'EQUAL',
            allocation: [{stratum: 1, label: 'Forest', color: '#0a0', area: 3e8, weight: 1, sampleSize: 30}]
        },
        sampleArrangement: {arrangementStrategy: 'RANDOM', seed: 1}
    },
    ui: {retrieveOptions: {destination: 'SEPAL'}}
}

describe('Sampling Design retrieve submission', () => {
    beforeEach(() => vi.clearAllMocks())

    it('does not publish while asset roots are still loading (pending), and notifies', () => {
        submitRetrieveRecipeTask(recipe, {googleAccount: true, assetRoots: undefined})
        expect(notifyError).toHaveBeenCalledTimes(1)
        expect(notifyError.mock.calls[0][0].error).toContain('pending')
        expect(publishEvent).not.toHaveBeenCalled()
        expect(submit$).not.toHaveBeenCalled()
    })

    it('publishes and submits when linked with a loaded, non-empty root list', () => {
        submitRetrieveRecipeTask(recipe, {googleAccount: true, assetRoots: ['users/me']})
        expect(notifyError).not.toHaveBeenCalled()
        expect(publishEvent).toHaveBeenCalledWith('submit_task', expect.objectContaining({recipe_type: 'SAMPLING_DESIGN'}))
        expect(submit$).toHaveBeenCalledTimes(1)
    })
})
