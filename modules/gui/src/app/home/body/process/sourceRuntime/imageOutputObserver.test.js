import {beforeEach, describe, expect, it, vi} from 'vitest'

import {createRecipeImageOutputObserver} from './imageOutputObserver'

// The GUI binding, exercised directly. Only the Earth Engine boundary is replaced: the shared graph builder,
// registry, CCDC, MASKING and SAMPLING_DESIGN declarations, resolver and observer all really run, because what is under test
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

const envelope = ({status, description = null, diagnostics = [], error = null, readiness}) =>
    ({status, description, diagnostics, error, readiness})

// Whether running the observed output is possible, as an observation that answered everything says.
const RUNNABLE = {status: 'READY', findings: [], needs: {records: [], observations: []}}

const MASK_BANDS = [{name: 'mask', arrayDimensions: 0}]

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

// CCDC is asked what it can be asked for, so names come back and CCDC's own declaration supplies their facts.
const CCDC_BANDS = ['tStart', 'ndvi_coefs']

const DECLARED_CCDC_BANDS = [
    {name: 'tStart', dataType: {arrayDimensions: 1}, pyramidingPolicy: 'sample'},
    {name: 'ndvi_coefs', dataType: {arrayDimensions: 2}, pyramidingPolicy: 'sample'}
]

const sampled = observed => observed.map(({name, arrayDimensions}) => ({
    name,
    dataType: {arrayDimensions},
    pyramidingPolicy: 'sample'
}))

describe('observing a CCDC recipe directly', () => {
    it('asks the bands API for the complete recipe record, not an id', () => {
        const recipe = ccdc()
        const {observer} = observerOver()
        observer.observe({recipe, loadedRecipes: catalogue([recipe])})

        expect(state.calls).toEqual([{recipe}])
        expect(state.calls[0].recipe.model).toEqual({})
        expect(state.calls[0].recipe.type).toBe('CCDC')
    })

    // Without data types the bands API answers from what the recipe says it can be asked for, which is the
    // question CCDC's declaration puts; the image it builds unrequested is a different, narrower answer.
    it('asks what the recipe can be asked for, not for the image it builds unrequested', () => {
        const recipe = ccdc()
        const {observer} = observerOver()
        observer.observe({recipe, loadedRecipes: catalogue([recipe])})

        expect(state.calls[0].includeDataTypes).toBeUndefined()
    })

    it('gives every declared band the physical facts and policy CCDC states', () => {
        const recipe = ccdc()
        const {observer, states} = observerOver()
        observer.observe({recipe, loadedRecipes: catalogue([recipe])})
        emit('RECIPE_REF:ccdc-1', CCDC_BANDS)

        expect(latest(states)).toEqual(envelope({
            status: 'READY',
            description: {
                executionReference: {type: 'RECIPE_REF', id: 'ccdc-1'},
                output: {kind: 'IMAGE', bands: DECLARED_CCDC_BANDS},
                evidence: []
            },
            readiness: RUNNABLE
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

    // The primary recipe describes it; running it builds the mask too, which is observed for whether it can.
    it('observes the primary recipe, and the mask asset its running builds', () => {
        const {root, loadedRecipes} = maskedCcdc()
        const {observer} = observerOver()
        observer.observe({recipe: root, loadedRecipes})

        expect(state.calls).toEqual([{recipe: loadedRecipes['ccdc-1']}, {asset: 'users/x/mask', includeDataTypes: true}])
        expect(state.subscribed).toEqual(['RECIPE_REF:ccdc-1', 'ASSET:users/x/mask'])
    })

    it('keeps MASKING as the execution reference while CCDC supplies names and policies', () => {
        const {root, loadedRecipes} = maskedCcdc()
        const {observer, states} = observerOver()
        observer.observe({recipe: root, loadedRecipes})
        emit('RECIPE_REF:ccdc-1', CCDC_BANDS)
        emit('ASSET:users/x/mask', MASK_BANDS)

        expect(latest(states)).toEqual(envelope({
            status: 'READY',
            description: {
                executionReference: {type: 'RECIPE_REF', id: 'masked-1'},
                output: {kind: 'IMAGE', bands: DECLARED_CCDC_BANDS},
                evidence: []
            },
            readiness: RUNNABLE
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

    it('asks the bands API for typed asset evidence, with no recipe placeholder', () => {
        const {root, loadedRecipes} = maskedAsset()
        const {observer} = observerOver()
        observer.observe({recipe: root, loadedRecipes})

        expect(state.calls).toEqual([
            {asset: 'users/x/primary', includeDataTypes: true},
            {asset: 'users/x/mask', includeDataTypes: true}
        ])
        expect('recipe' in state.calls[0]).toBe(false)
    })

    it('resolves verified array dimensions as sample while preserving type evidence and band order', () => {
        const {root, loadedRecipes} = maskedAsset()
        const {observer, states} = observerOver()
        observer.observe({recipe: root, loadedRecipes})
        emit('ASSET:users/x/primary', [
            {name: 'future_matrix', arrayDimensions: 2},
            {name: 'tStart', arrayDimensions: 1}
        ])
        emit('ASSET:users/x/mask', MASK_BANDS)

        expect(latest(states)).toEqual(envelope({
            status: 'READY',
            description: {
                executionReference: {type: 'RECIPE_REF', id: 'masked-1'},
                output: {kind: 'IMAGE', bands: sampled([
                    {name: 'future_matrix', arrayDimensions: 2},
                    {name: 'tStart', arrayDimensions: 1}
                ])},
                evidence: []
            },
            readiness: RUNNABLE
        }))
    })

    it('resolves scalar physical schema without inventing a pyramiding policy', () => {
        const {root, loadedRecipes} = maskedAsset()
        const {observer, states} = observerOver()
        observer.observe({recipe: root, loadedRecipes})
        emit('ASSET:users/x/primary', [{name: 'B1', arrayDimensions: 0}])
        emit('ASSET:users/x/mask', MASK_BANDS)

        expect(latest(states)).toEqual(envelope({
            status: 'READY',
            description: {
                executionReference: {type: 'RECIPE_REF', id: 'masked-1'},
                output: {
                    kind: 'IMAGE',
                    bands: [{name: 'B1', dataType: {arrayDimensions: 0}}]
                },
                evidence: []
            },
            readiness: RUNNABLE
        }))
    })

    it('carries the encoding the asset states', () => {
        const {root, loadedRecipes} = maskedAsset()
        const {observer, states} = observerOver()
        observer.observe({recipe: root, loadedRecipes})
        const reflectance = {scale: 0.0001, offset: 0, unit: '1'}
        emit('ASSET:users/x/primary', [
            {name: 'red', arrayDimensions: 0, encoding: reflectance},
            {name: 'qa', arrayDimensions: 0}
        ])
        emit('ASSET:users/x/mask', MASK_BANDS)

        expect(latest(states).description.output.bands).toEqual([
            {name: 'red', dataType: {arrayDimensions: 0}, encoding: reflectance},
            {name: 'qa', dataType: {arrayDimensions: 0}}
        ])
    })

    it('consults no copied recipe, provenance, or visualization metadata', () => {
        const primary = {
            type: 'ASSET',
            id: 'users/x/primary',
            recipe_type: 'CCDC',
            recipe_id: 'copied-recipe',
            visualizations: [{bands: ['tStart']}]
        }
        const root = masking('masked-1', {
            primary,
            mask: assetSelection('users/x/mask')
        })
        const {observer} = observerOver()
        observer.observe({recipe: root, loadedRecipes: catalogue([root])})

        expect(state.calls).toEqual([
            {asset: 'users/x/primary', includeDataTypes: true},
            {asset: 'users/x/mask', includeDataTypes: true}
        ])
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
            }],
            readiness: expect.objectContaining({status: 'UNAVAILABLE', findings: []})
        }))
    })

    // A recipe producing no image is refused as one, whatever evidence could be read.
    it('reports a recipe with no image output as invalid, observing nothing', () => {
        const root = {id: 'design-1', type: 'SAMPLING_DESIGN', model: {}}
        const {observer, states} = observerOver()
        observer.observe({recipe: root, loadedRecipes: catalogue([root])})

        expect(state.calls).toEqual([])
        expect(latest(states)).toEqual(envelope({
            status: 'INVALID',
            diagnostics: [{code: 'NON_IMAGE_OUTPUT', path: [], recipePath: ['design-1']}],
            readiness: expect.objectContaining({status: 'NOT_READY'})
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
        expect(published).toEqual(envelope({
            status: 'UNAVAILABLE',
            error: failure,
            readiness: expect.objectContaining({status: 'UNAVAILABLE', findings: []})
        }))
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
        emit('ASSET:users/x/mask', MASK_BANDS)

        expect(latest(states)).toEqual(envelope({
            status: 'READY',
            description: {
                executionReference: {type: 'RECIPE_REF', id: 'masked-1'},
                output: {kind: 'IMAGE', bands: DECLARED_CCDC_BANDS},
                evidence: []
            },
            readiness: RUNNABLE
        }))
        expect(JSON.stringify({root, loadedRecipes})).toEqual(before)
    })
})
