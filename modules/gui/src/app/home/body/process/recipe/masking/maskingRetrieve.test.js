import {beforeEach, describe, expect, it, vi} from 'vitest'

// Masking's Retrieve wiring, without Redux or React. What is under test is that Masking dispatches its ordinary
// update, then hands the generic orchestrator the exact recipe, the explicit options, its own resolver function
// and its legacy policy - and knows nothing about catalogues, observation or diagnostics.

const state = vi.hoisted(() => ({
    orchestrated: [],
    sideEffects: [],
    selects: [],
    order: []
}))

vi.mock('~/app/home/body/process/recipe/observedRetrieve', () => ({
    submitObservedRetrieve: args => {
        state.order.push('submit')
        state.orchestrated.push(args)
    }
}))

vi.mock('~/app/home/body/process/recipe', () => ({
    recipeActionBuilder: () => () => {
        const builder = {
            setAll: () => builder,
            sideEffect: fn => {
                state.sideEffects.push(fn)
                return builder
            },
            dispatch: () => state.order.push('dispatch')
        }
        return builder
    }
}))

vi.mock('~/store', () => ({
    select: (...path) => {
        state.selects.push(path)
        return undefined
    }
}))

vi.mock('~/translate', () => ({
    msg: key => (Array.isArray(key) ? key.join('.') : key)
}))

const {RecipeActions, submitMaskingRetrieve} = await import('./maskingRecipe')

beforeEach(() => {
    state.orchestrated = []
    state.sideEffects = []
    state.selects = []
    state.order = []
})

const recipe = () => ({
    id: 'masked-1',
    type: 'MASKING',
    model: {imageToMask: {type: 'RECIPE_REF', id: 'ccdc-1'}},
    ui: {retrieveOptions: {destination: 'GEE', bands: ['stale-band']}}
})

const resolveImageOutput$ = () => undefined

const retrieveOptions = {destination: 'GEE', bands: ['tStart']}

describe('Masking Retrieve', () => {
    // The orchestrator reads no Redux, but a side effect would still run inside the reducer. Dispatching first
    // and then submitting keeps the action a pure state update.
    it('dispatches before orchestrating, and registers no reducer side effect', () => {
        submitMaskingRetrieve({recipe: recipe(), retrieveOptions, resolveImageOutput$})

        expect(state.sideEffects).toEqual([])
        expect(state.order).toEqual(['dispatch', 'submit'])
    })

    it('forwards the exact recipe, options, resolver and fallback policy', () => {
        const current = recipe()
        submitMaskingRetrieve({recipe: current, retrieveOptions, resolveImageOutput$})

        expect(state.orchestrated).toHaveLength(1)
        const args = state.orchestrated[0] || {}
        expect(args.recipe).toBe(current)
        expect(args.retrieveOptions).toBe(retrieveOptions)
        expect(args.resolveImageOutput$).toBe(resolveImageOutput$)
        expect(typeof args.fallbackPyramidingPolicy).toBe('function')
        expect(args.fallbackPyramidingPolicy(['change', 'class'])).toEqual({change: 'mode', class: 'mean'})
    })

    it('never receives or reads a catalogue', () => {
        submitMaskingRetrieve({recipe: recipe(), retrieveOptions, resolveImageOutput$})

        const args = state.orchestrated[0] || {}
        expect('loadedRecipes' in args).toBe(false)
        expect(Object.keys(args).sort())
            .toEqual(['fallbackPyramidingPolicy', 'recipe', 'resolveImageOutput$', 'retrieveOptions'])
        expect(state.selects).toEqual([])
    })

    it('keeps the recipe action a pure Redux update', () => {
        RecipeActions('masked-1').retrieve(retrieveOptions)

        expect(state.order).toEqual(['dispatch'])
        expect(state.orchestrated).toEqual([])
        expect(state.sideEffects).toEqual([])
    })
})
