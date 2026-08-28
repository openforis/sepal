import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createRecipeImageOutputObserver} from './imageOutputObserver'

// The GUI binding, exercised directly. Only the Earth Engine boundary is replaced: the shared graph builder,
// registry, CCDC and MASKING declarations, resolver and observer all really run, because what is under test
// is whether this adapter connects them correctly.
//
// Nothing is rendered, and there is no Redux store.
//
// Persisted types, roles and diagnostic codes are written as literals: a production rename must not make
// these pass.

const state = vi.hoisted(() => ({
    calls: [],
    subscribers: new Map(),
    subscribed: [],
    torndown: []
}))

vi.mock('~/apiRegistry', async () => {
    const {Observable} = await import('rxjs')
    return {
        default: {
            gee: {
                bands$: params => {
                    state.calls.push(params)
                    const key = params.asset
                        ? `ASSET:${params.asset}`
                        : `RECIPE_REF:${params.recipe?.id}`
                    return new Observable(subscriber => {
                        state.subscribed.push(key)
                        state.subscribers.set(key, subscriber)
                        return () => state.torndown.push(key)
                    })
                }
            }
        }
    }
})

beforeEach(() => {
    state.calls = []
    state.subscribers = new Map()
    state.subscribed = []
    state.torndown = []
})

const envelope = ({status, description = null, diagnostics = [], error = null}) =>
    ({status, description, diagnostics, error})

const observerOver = () => {
    const observer = createRecipeImageOutputObserver()
    const states = []
    let terminated = null
    observer.state$.subscribe({
        next: published => states.push(published),
        error: error => terminated = {error},
        complete: () => terminated = {complete: true}
    })
    return {observer, states, terminated: () => terminated}
}

const latest = states => states[states.length - 1]

const emit = (key, bandNames) => {
    const subscriber = state.subscribers.get(key)
    subscriber?.next(bandNames)
    subscriber?.complete()
}

const fail = (key, error) => state.subscribers.get(key)?.error(error)

const ccdc = (id = 'ccdc-1') => ({id, type: 'CCDC', model: {}})

const masking = (id, {primary, mask}) => ({
    id,
    type: 'MASKING',
    model: {imageToMask: primary, imageMask: mask}
})

const recipeSelection = id => ({type: 'RECIPE_REF', id})
const assetSelection = id => ({type: 'ASSET', id})

const catalogue = recipes => Object.fromEntries(recipes.map(recipe => [recipe.id, recipe]))

const CCDC_BANDS = ['tStart', 'ndvi_coefs']
const sampled = names => names.map(name => ({name, pyramidingPolicy: 'sample'}))

describe('observing a CCDC recipe directly', () => {
    it('asks the bands API for the complete recipe record, not an id', () => {
        const recipe = ccdc()
        const {observer} = observerOver()
        observer.observe({recipe, loadedRecipes: catalogue([recipe])})

        expect(state.calls).toEqual([{recipe}])
        expect(state.calls[0].recipe.model).toEqual({})
        expect(state.calls[0].recipe.type).toBe('CCDC')
    })

    it('turns observed names into a ready description with sample on every band', () => {
        const recipe = ccdc()
        const {observer, states} = observerOver()
        observer.observe({recipe, loadedRecipes: catalogue([recipe])})
        emit('RECIPE_REF:ccdc-1', CCDC_BANDS)

        expect(latest(states)).toEqual(envelope({
            status: 'READY',
            description: {
                executionReference: {type: 'RECIPE_REF', id: 'ccdc-1'},
                output: {kind: 'IMAGE', bands: sampled(CCDC_BANDS)},
                evidence: []
            }
        }))
    })
})

describe('observing MASKING over CCDC with an asset mask', () => {
    const maskedCcdc = () => {
        const inner = ccdc()
        const root = masking('masked-1', {
            primary: recipeSelection('ccdc-1'),
            mask: assetSelection('users/x/mask')
        })
        return {root, loadedRecipes: catalogue([root, inner])}
    }

    it('observes only the primary recipe, never the mask asset', () => {
        const {root, loadedRecipes} = maskedCcdc()
        const {observer} = observerOver()
        observer.observe({recipe: root, loadedRecipes})

        expect(state.calls).toEqual([{recipe: loadedRecipes['ccdc-1']}])
        expect(state.subscribed).toEqual(['RECIPE_REF:ccdc-1'])
    })

    it('keeps MASKING as the execution reference while CCDC supplies names and policies', () => {
        const {root, loadedRecipes} = maskedCcdc()
        const {observer, states} = observerOver()
        observer.observe({recipe: root, loadedRecipes})
        emit('RECIPE_REF:ccdc-1', CCDC_BANDS)

        expect(latest(states)).toEqual(envelope({
            status: 'READY',
            description: {
                executionReference: {type: 'RECIPE_REF', id: 'masked-1'},
                output: {kind: 'IMAGE', bands: sampled(CCDC_BANDS)},
                evidence: []
            }
        }))
    })
})

describe('observing MASKING over an asset', () => {
    const maskedAsset = () => {
        const root = masking('masked-1', {
            primary: assetSelection('users/x/primary'),
            mask: assetSelection('users/x/mask')
        })
        return {root, loadedRecipes: catalogue([root])}
    }

    it('asks the bands API by asset id, with no recipe placeholder', () => {
        const {root, loadedRecipes} = maskedAsset()
        const {observer} = observerOver()
        observer.observe({recipe: root, loadedRecipes})

        expect(state.calls).toEqual([{asset: 'users/x/primary'}])
        expect('recipe' in state.calls[0]).toBe(false)
    })

    // Earth Engine reports band names for an asset and no export policy. Nothing here is entitled to supply
    // one, so the policy is unknown rather than defaulted, and the state says so.
    it('guesses no policy and reports the exact incompleteness', () => {
        const {root, loadedRecipes} = maskedAsset()
        const {observer, states} = observerOver()
        observer.observe({recipe: root, loadedRecipes})
        emit('ASSET:users/x/primary', ['B1'])

        expect(latest(states)).toEqual(envelope({
            status: 'UNAVAILABLE',
            diagnostics: [{
                code: 'INCOMPLETE_IMAGE_OUTPUT',
                path: ['bands', 0, 'pyramidingPolicy'],
                recipePath: ['masked-1'],
                reference: {type: 'ASSET', id: 'users/x/primary'}
            }]
        }))
    })
})

describe('classifying what the session cannot answer', () => {
    // `loadedRecipes` is a reference-counted session catalogue. A referenced recipe missing from it is
    // routinely still saved and merely not open, so this is unavailable evidence and never a deleted recipe.
    it('reports a dependency absent from the catalogue as unavailable, observing nothing', () => {
        const root = masking('masked-1', {
            primary: recipeSelection('ccdc-absent'),
            mask: assetSelection('users/x/mask')
        })
        const {observer, states} = observerOver()
        observer.observe({recipe: root, loadedRecipes: catalogue([root])})

        expect(state.calls).toEqual([])
        expect(latest(states)).toEqual(envelope({
            status: 'UNAVAILABLE',
            diagnostics: [{
                code: 'MISSING_SOURCE',
                role: 'PRIMARY_IMAGE',
                path: ['model', 'imageToMask'],
                recipePath: ['masked-1', 'ccdc-absent']
            }]
        }))
    })

    // The coexistence boundary for the Retrieve migration: falling back is allowed only when a recipe type
    // has declared no output, never because a migrated recipe is invalid or its evidence is pending.
    it('reports a registered but unmigrated recipe type as invalid, observing nothing', () => {
        const root = {id: 'mosaic-1', type: 'MOSAIC', model: {}}
        const {observer, states} = observerOver()
        observer.observe({recipe: root, loadedRecipes: catalogue([root])})

        expect(state.calls).toEqual([])
        expect(latest(states)).toEqual(envelope({
            status: 'INVALID',
            diagnostics: [{code: 'UNDECLARED_OUTPUT', path: [], recipePath: ['mosaic-1']}]
        }))
    })
})

describe('the Earth Engine boundary', () => {
    it('retains an API failure unchanged and does not terminate', () => {
        const recipe = ccdc()
        const failure = new Error('bands request failed')
        const {observer, states, terminated} = observerOver()
        observer.observe({recipe, loadedRecipes: catalogue([recipe])})
        fail('RECIPE_REF:ccdc-1', failure)

        const published = latest(states)
        expect(published).toEqual(envelope({status: 'UNAVAILABLE', error: failure}))
        expect(published.error).toBe(failure)
        expect(terminated()).toBe(null)
    })

    it('tears down the in-flight request on cancel and returns to pending', () => {
        const recipe = ccdc()
        const {observer, states} = observerOver()
        observer.observe({recipe, loadedRecipes: catalogue([recipe])})
        expect(state.torndown).toEqual([])

        observer.cancel()
        expect(state.torndown).toEqual(['RECIPE_REF:ccdc-1'])
        expect(latest(states)).toEqual(envelope({status: 'PENDING'}))
    })
})

describe('inputs are evidence, not storage', () => {
    it('modifies neither the recipe nor the loaded catalogue', () => {
        const inner = ccdc()
        const root = masking('masked-1', {
            primary: recipeSelection('ccdc-1'),
            mask: assetSelection('users/x/mask')
        })
        const loadedRecipes = catalogue([root, inner])
        const before = JSON.stringify({root, loadedRecipes})
        const {observer, states} = observerOver()
        observer.observe({recipe: root, loadedRecipes})
        emit('RECIPE_REF:ccdc-1', CCDC_BANDS)

        expect(latest(states)).toEqual(envelope({
            status: 'READY',
            description: {
                executionReference: {type: 'RECIPE_REF', id: 'masked-1'},
                output: {kind: 'IMAGE', bands: sampled(CCDC_BANDS)},
                evidence: []
            }
        }))
        expect(JSON.stringify({root, loadedRecipes})).toEqual(before)
    })
})
