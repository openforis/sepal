import {jest} from '@jest/globals'
import {Observable, of} from 'rxjs'

import {
    completeRecipeClosure$,
    DEFAULT_RECIPE_CLOSURE_LIMITS as LIMITS
} from '#sepal/recipe/source/completeRecipeClosure'

const recipeRef = id => ({type: 'RECIPE_REF', id})
const assetRef = id => ({type: 'ASSET', id})
const masking = (id, {primary = assetRef(`projects/p/assets/${id}`), mask = assetRef('projects/p/assets/mask')} = {}) => ({
    id,
    type: 'MASKING',
    model: {imageToMask: primary, imageMask: mask}
})
const slice = (id, source = assetRef(`projects/p/assets/${id}`)) => ({
    id,
    type: 'CCDC_SLICE',
    model: {source}
})

const operation = ({rootRecipe, seed = [], loadRecipesById$ = jest.fn(() => of([])), limits = LIMITS}) =>
    completeRecipeClosure$({
        rootRecipe,
        seedRecipesById: seed instanceof Map
            ? seed
            : new Map(seed.map(recipe => [recipe.id, recipe])),
        loadRecipesById$,
        limits
    })

const settled = operation$ => new Promise(resolve => {
    const emissions = []
    operation$.subscribe({
        next: value => emissions.push(value),
        error: error => resolve({emissions, error}),
        complete: () => resolve({emissions, result: emissions.at(-1)})
    })
})

const complete = async args => {
    const outcome = await settled(operation(args))
    expect(outcome.error).toBeUndefined()
    expect(outcome.result?.status).toBe('COMPLETE')
    return outcome
}

const graphIds = ({result}) => result.graph.recipes.map(({id}) => id)
const catalogueIds = ({result}) => [...result.recipesById.keys()]

describe('completeRecipeClosure$', () => {
    it('publishes one immutable default limit configuration', () => {
        expect(LIMITS).toEqual({
            maxDepth: 16,
            maxNodes: 64,
            maxSerializedBytes: 8 * 1024 * 1024,
            maxLoadingRounds: 16,
            maxFrontierSize: 32,
            requestConcurrency: 4
        })
        expect(Object.isFrozen(LIMITS)).toBe(true)
    })

    it('is cold: neither graph access nor loading occurs before subscription', () => {
        let modelReads = 0
        const rootRecipe = {id: 'root', type: 'MASKING'}
        Object.defineProperty(rootRecipe, 'model', {
            get: () => {
                modelReads++
                return {imageToMask: recipeRef('child'), imageMask: assetRef('projects/p/assets/mask')}
            }
        })
        const loadRecipesById$ = jest.fn(() => of([slice('child')]))

        const operation$ = operation({rootRecipe, loadRecipesById$})

        expect(modelReads).toBe(0)
        expect(loadRecipesById$).not.toHaveBeenCalled()
        operation$.subscribe({error: () => undefined})
        expect(modelReads).toBeGreaterThan(0)
    })

    it('returns a complete seeded graph without calling the recipe loader', async () => {
        const child = slice('child')
        const rootRecipe = masking('root', {primary: recipeRef('child')})
        const loadRecipesById$ = jest.fn()

        const outcome = await complete({rootRecipe, seed: [child], loadRecipesById$})

        expect(outcome.emissions.map(({status}) => status)).toEqual(['COMPLETE'])
        expect(graphIds(outcome)).toEqual(['root', 'child'])
        expect(loadRecipesById$).not.toHaveBeenCalled()
    })

    it('loads one direct missing dependency', async () => {
        const rootRecipe = masking('root', {primary: recipeRef('child')})
        const child = slice('child')
        const loadRecipesById$ = jest.fn(({ids}) => of(ids.map(() => child)))

        const outcome = await complete({rootRecipe, loadRecipesById$})

        expect(loadRecipesById$).toHaveBeenCalledWith({ids: ['child'], concurrency: 4})
        expect(outcome.emissions.map(({status}) => status)).toEqual(['LOADING', 'COMPLETE'])
        expect(graphIds(outcome)).toEqual(['root', 'child'])
    })

    it('loads a transitive chain in successive graph-derived frontiers', async () => {
        const rootRecipe = masking('root', {primary: recipeRef('middle')})
        const middle = masking('middle', {primary: recipeRef('leaf')})
        const leaf = slice('leaf')
        const records = new Map([[middle.id, middle], [leaf.id, leaf]])
        const loadRecipesById$ = jest.fn(({ids}) => of(ids.map(id => records.get(id))))

        const outcome = await complete({rootRecipe, loadRecipesById$})

        expect(loadRecipesById$.mock.calls.map(([{ids}]) => ids)).toEqual([['middle'], ['leaf']])
        expect(outcome.emissions.map(({status}) => status)).toEqual(['LOADING', 'COMPLETE'])
        expect(graphIds(outcome)).toEqual(['root', 'middle', 'leaf'])
    })

    it('uses successive captured-seed frontiers without emitting LOADING', async () => {
        const rootRecipe = masking('root', {primary: recipeRef('middle')})
        const middle = masking('middle', {primary: recipeRef('leaf')})
        const leaf = slice('leaf')
        const loadRecipesById$ = jest.fn()

        const outcome = await complete({rootRecipe, seed: [middle, leaf], loadRecipesById$})

        expect(outcome.emissions.map(({status}) => status)).toEqual(['COMPLETE'])
        expect(loadRecipesById$).not.toHaveBeenCalled()
        expect(graphIds(outcome)).toEqual(['root', 'middle', 'leaf'])
    })

    it('deduplicates a diamond frontier and loads the shared dependency once', async () => {
        const rootRecipe = masking('root', {primary: recipeRef('left'), mask: recipeRef('right')})
        const left = masking('left', {primary: recipeRef('shared')})
        const right = masking('right', {primary: recipeRef('shared')})
        const shared = slice('shared')
        const records = new Map([left, right, shared].map(recipe => [recipe.id, recipe]))
        const loadRecipesById$ = jest.fn(({ids}) => of(ids.map(id => records.get(id))))

        const outcome = await complete({rootRecipe, loadRecipesById$})

        expect(loadRecipesById$.mock.calls.map(([{ids}]) => ids)).toEqual([['left', 'right'], ['shared']])
        expect(graphIds(outcome)).toEqual(['root', 'left', 'shared', 'right'])
    })

    it('returns an existing cycle immediately without loading', async () => {
        const rootRecipe = masking('root', {primary: recipeRef('root')})
        const loadRecipesById$ = jest.fn()

        const outcome = await complete({rootRecipe, loadRecipesById$})

        expect(outcome.result.graph.diagnostics).toEqual([expect.objectContaining({
            code: 'CYCLIC_DEPENDENCY',
            recipePath: ['root', 'root']
        })])
        expect(loadRecipesById$).not.toHaveBeenCalled()
    })

    it('stops after a loaded record reveals a cycle', async () => {
        const rootRecipe = masking('root', {primary: recipeRef('child')})
        const child = masking('child', {primary: recipeRef('root')})
        const loadRecipesById$ = jest.fn(() => of([child]))

        const outcome = await complete({rootRecipe, loadRecipesById$})

        expect(loadRecipesById$).toHaveBeenCalledTimes(1)
        expect(outcome.result.graph.diagnostics).toEqual([expect.objectContaining({
            code: 'CYCLIC_DEPENDENCY',
            recipePath: ['root', 'child', 'root']
        })])
    })

    it('does not load a missing sibling when any definitive diagnostic already exists', async () => {
        const rootRecipe = masking('root', {
            primary: {type: 'RECIPE_REF'},
            mask: recipeRef('unrelated')
        })
        const loadRecipesById$ = jest.fn()

        const outcome = await complete({rootRecipe, loadRecipesById$})

        expect(outcome.result.graph.diagnostics.map(({code}) => code)).toEqual([
            'INCOMPLETE_REFERENCE',
            'MISSING_SOURCE'
        ])
        expect(loadRecipesById$).not.toHaveBeenCalled()
    })

    it('keeps the exact root instead of a captured record with the same id', async () => {
        const currentChild = slice('current-child')
        const staleRoot = masking('root', {primary: recipeRef('stale-child')})
        const currentRoot = masking('root', {primary: recipeRef('current-child')})

        const outcome = await complete({rootRecipe: currentRoot, seed: [staleRoot, currentChild]})

        expect(graphIds(outcome)).toEqual(['root', 'current-child'])
        expect(outcome.result.graph.recipes[0]).toBe(currentRoot)
        expect(outcome.result.recipesById.get('root')).toBe(currentRoot)
    })

    it('uses matching captured-session records without replacing them from persistence', async () => {
        const captured = slice('captured')
        const rootRecipe = masking('root', {primary: recipeRef('captured'), mask: recipeRef('loaded')})
        const loaded = slice('loaded')
        const loadRecipesById$ = jest.fn(() => of([loaded]))

        const outcome = await complete({rootRecipe, seed: [captured], loadRecipesById$})

        expect(loadRecipesById$).toHaveBeenCalledWith({ids: ['loaded'], concurrency: 4})
        expect(outcome.result.recipesById.get('captured')).toBe(captured)
    })

    it('merges out-of-order batch results in deterministic frontier order', async () => {
        const rootRecipe = masking('root', {primary: recipeRef('left'), mask: recipeRef('right')})
        const left = slice('left')
        const right = slice('right')
        const loadRecipesById$ = jest.fn(() => of([right, left]))

        const outcome = await complete({rootRecipe, loadRecipesById$})

        expect(catalogueIds(outcome)).toEqual(['root', 'left', 'right'])
        expect(graphIds(outcome)).toEqual(['root', 'left', 'right'])
    })
})

describe('loader response validation', () => {
    const rootRecipe = masking('root', {primary: recipeRef('left'), mask: recipeRef('right')})
    const left = slice('left')
    const right = slice('right')

    it.each([
        ['a non-array response', {records: {left, right}, code: 'RECIPE_CLOSURE_MALFORMED_RESPONSE'}],
        ['a missing record', {records: [left], code: 'RECIPE_CLOSURE_MISSING_RECORD'}],
        ['a duplicate record', {records: [left, left, right], code: 'RECIPE_CLOSURE_DUPLICATE_RECORD'}],
        ['an unrequested extra record', {records: [left, right, slice('extra')], code: 'RECIPE_CLOSURE_UNREQUESTED_RECORD'}],
        ['a null record', {records: [left, null], code: 'RECIPE_CLOSURE_MALFORMED_RECORD'}],
        ['an array record', {records: [left, []], code: 'RECIPE_CLOSURE_MALFORMED_RECORD'}],
        ['a numeric record', {records: [left, 42], code: 'RECIPE_CLOSURE_MALFORMED_RECORD'}],
        ['a boolean record', {records: [left, true], code: 'RECIPE_CLOSURE_MALFORMED_RECORD'}],
        ['a string record', {records: [left, 'right'], code: 'RECIPE_CLOSURE_MALFORMED_RECORD'}],
        ['a record without an id', {records: [left, {type: 'CCDC_SLICE', model: {}}], code: 'RECIPE_CLOSURE_MALFORMED_RECORD'}],
        ['a record with a non-string id', {records: [left, {id: 7, type: 'CCDC_SLICE', model: {}}], code: 'RECIPE_CLOSURE_MALFORMED_RECORD'}],
        ['a record with a blank id', {records: [left, {id: ' ', type: 'CCDC_SLICE', model: {}}], code: 'RECIPE_CLOSURE_MALFORMED_RECORD'}],
        ['a record without a recipe type', {records: [left, {id: 'right', model: {}}], code: 'RECIPE_CLOSURE_MALFORMED_RECORD'}],
        ['a record with a blank recipe type', {records: [left, {id: 'right', type: ' ', model: {}}], code: 'RECIPE_CLOSURE_MALFORMED_RECORD'}],
        ['a record with a non-string recipe type', {records: [left, {id: 'right', type: 7, model: {}}], code: 'RECIPE_CLOSURE_MALFORMED_RECORD'}]
    ])('rejects %s', async (_name, {records, code}) => {
        const outcome = await settled(operation({
            rootRecipe,
            loadRecipesById$: () => of(records)
        }))

        expect(outcome.result).toBeUndefined()
        expect(outcome.error).toEqual(expect.objectContaining({code}))
    })

    it('rejects a selected captured-seed entry whose map key differs from the record id', async () => {
        const seed = new Map([['left', slice('different')]])
        const loadRecipesById$ = jest.fn()
        const outcome = await settled(operation({
            rootRecipe: masking('root', {primary: recipeRef('left')}),
            seed,
            loadRecipesById$
        }))

        expect(outcome.error).toEqual(expect.objectContaining({code: 'RECIPE_CLOSURE_SEED_ID_MISMATCH'}))
        expect(loadRecipesById$).not.toHaveBeenCalled()
    })

    it('passes a valid unsupported recipe type to the shared graph diagnostic', async () => {
        const rootRecipe = masking('root', {primary: recipeRef('retired')})
        const retired = {id: 'retired', type: 'RETIRED_RECIPE', model: {}}

        const outcome = await complete({
            rootRecipe,
            loadRecipesById$: () => of([retired])
        })

        expect(outcome.result.graph.diagnostics).toEqual([{
            code: 'UNSUPPORTED_RECIPE_TYPE',
            path: [],
            recipePath: ['root', 'retired']
        }])
        expect(outcome.result.recipesById.get('retired')).toBe(retired)
    })
})

describe('closure resource limits', () => {
    const expectLimit = async ({rootRecipe, records = [], seed = [], limits, code}) => {
        const recordsById = new Map(records.map(recipe => [recipe.id, recipe]))
        const loadRecipesById$ = jest.fn(({ids}) => of(ids.map(id => recordsById.get(id))))
        const outcome = await settled(operation({rootRecipe, seed, loadRecipesById$, limits: {...LIMITS, ...limits}}))
        expect(outcome.error).toEqual(expect.objectContaining({code}))
        return {loadRecipesById$, outcome}
    }

    it('uses MISSING_SOURCE.recipePath to stop depth before the prohibited next loader call', async () => {
        const leaf = slice('leaf')
        const middle = masking('middle', {primary: recipeRef('leaf')})
        const rootRecipe = masking('root', {primary: recipeRef('middle')})
        const {loadRecipesById$} = await expectLimit({
            rootRecipe,
            records: [middle, leaf],
            limits: {maxDepth: 1},
            code: 'RECIPE_CLOSURE_DEPTH_LIMIT'
        })
        expect(loadRecipesById$.mock.calls.map(([{ids}]) => ids)).toEqual([['middle']])
    })

    it('enforces maximum node count including the root before loading another node', async () => {
        const {loadRecipesById$} = await expectLimit({
            rootRecipe: masking('root', {primary: recipeRef('child')}),
            records: [slice('child')],
            limits: {maxNodes: 1},
            code: 'RECIPE_CLOSURE_NODE_LIMIT'
        })
        expect(loadRecipesById$).not.toHaveBeenCalled()
    })

    it('enforces serialized UTF-8 bytes rather than JavaScript string length', async () => {
        const rootRecipe = masking('root')
        rootRecipe.label = '🌳'.repeat(20)
        const serialized = JSON.stringify(rootRecipe)
        const utf8Bytes = new TextEncoder().encode(serialized).length
        expect(utf8Bytes).toBeGreaterThan(serialized.length)

        await expectLimit({
            rootRecipe,
            limits: {maxSerializedBytes: utf8Bytes - 1},
            code: 'RECIPE_CLOSURE_SERIALIZED_BYTE_LIMIT'
        })
    })

    it('does not retain or count an unrelated large captured-seed record', async () => {
        const rootRecipe = masking('root')
        const unrelated = slice('unrelated')
        unrelated.large = '🌳'.repeat(1000)
        const rootBytes = new TextEncoder().encode(JSON.stringify(rootRecipe)).length

        const outcome = await complete({
            rootRecipe,
            seed: [unrelated],
            limits: {...LIMITS, maxSerializedBytes: rootBytes}
        })

        expect(catalogueIds(outcome)).toEqual(['root'])
        expect(outcome.result.recipesById.has('unrelated')).toBe(false)
    })

    it('enforces loading rounds before starting the prohibited next round', async () => {
        const middle = masking('middle', {primary: recipeRef('leaf')})
        const {loadRecipesById$} = await expectLimit({
            rootRecipe: masking('root', {primary: recipeRef('middle')}),
            records: [middle, slice('leaf')],
            limits: {maxLoadingRounds: 1},
            code: 'RECIPE_CLOSURE_LOADING_ROUND_LIMIT'
        })
        expect(loadRecipesById$.mock.calls.map(([{ids}]) => ids)).toEqual([['middle']])
    })

    it('enforces frontier width before invoking the loader', async () => {
        const {loadRecipesById$} = await expectLimit({
            rootRecipe: masking('root', {primary: recipeRef('left'), mask: recipeRef('right')}),
            records: [slice('left'), slice('right')],
            limits: {maxFrontierSize: 1},
            code: 'RECIPE_CLOSURE_FRONTIER_LIMIT'
        })
        expect(loadRecipesById$).not.toHaveBeenCalled()
    })

    it('passes the finite request-concurrency limit to each logical frontier', async () => {
        const loadRecipesById$ = jest.fn(() => of([slice('child')]))
        await complete({
            rootRecipe: masking('root', {primary: recipeRef('child')}),
            loadRecipesById$,
            limits: {...LIMITS, requestConcurrency: 2}
        })
        expect(loadRecipesById$).toHaveBeenCalledWith({ids: ['child'], concurrency: 2})
    })

    it.each(Object.keys(LIMITS))('rejects a missing %s limit field', async field => {
        const limits = {...LIMITS}
        delete limits[field]
        const outcome = await settled(operation({rootRecipe: masking('root'), limits}))

        expect(outcome.error).toEqual(expect.objectContaining({code: 'RECIPE_CLOSURE_INVALID_LIMITS'}))
    })

    it.each([
        ['a null configuration', null],
        ['an empty configuration', {}],
        ['a zero value', {...LIMITS, maxNodes: 0}],
        ['a negative value', {...LIMITS, maxNodes: -1}],
        ['a fractional value', {...LIMITS, maxNodes: 1.5}],
        ['an infinite value', {...LIMITS, maxNodes: Infinity}],
        ['a string value', {...LIMITS, maxNodes: '4'}]
    ])('rejects %s with a controlled error', async (_name, limits) => {
        const outcome = await settled(operation({rootRecipe: masking('root'), limits}))

        expect(outcome.error).toEqual(expect.objectContaining({code: 'RECIPE_CLOSURE_INVALID_LIMITS'}))
    })
})

describe('operation ownership', () => {
    it('leaves the input seed unchanged and owns a new reachable-only catalogue', async () => {
        const rootRecipe = masking('root', {primary: recipeRef('child')})
        const staleRoot = masking('root', {primary: recipeRef('stale')})
        const child = slice('child')
        const unreachable = slice('unreachable')
        const seed = new Map([
            ['root', staleRoot],
            ['child', child],
            ['unreachable', unreachable]
        ])
        const before = [...seed.entries()]

        const outcome = await complete({rootRecipe, seed})

        expect([...seed.entries()]).toEqual(before)
        expect(outcome.result.recipesById).not.toBe(seed)
        expect(catalogueIds(outcome)).toEqual(['root', 'child'])
        expect(outcome.result.recipesById.get('root')).toBe(rootRecipe)
        expect(outcome.result.recipesById.get('child')).toBe(child)
        expect(outcome.result.recipesById.has('unreachable')).toBe(false)
    })

    it('returns a newly owned catalogue for every subscription while retaining record identity', async () => {
        const rootRecipe = masking('root', {primary: recipeRef('child')})
        const child = slice('child')
        const operation$ = operation({rootRecipe, seed: [child]})
        const first = await settled(operation$)
        const second = await settled(operation$)

        expect(first.result.recipesById).not.toBe(second.result.recipesById)
        expect(first.result.recipesById.get('root')).toBe(rootRecipe)
        expect(second.result.recipesById.get('root')).toBe(rootRecipe)
        expect(first.result.recipesById.get('child')).toBe(child)
        expect(second.result.recipesById.get('child')).toBe(child)
    })

    it('retains loaded record identity in its owned catalogue', async () => {
        const rootRecipe = masking('root', {primary: recipeRef('child')})
        const child = slice('child')

        const outcome = await complete({
            rootRecipe,
            loadRecipesById$: () => of([child])
        })

        expect(outcome.result.recipesById.get('root')).toBe(rootRecipe)
        expect(outcome.result.recipesById.get('child')).toBe(child)
    })

    it('propagates a loader failure without converting it into graph evidence', async () => {
        const failure = Object.assign(new Error('forbidden'), {status: 403})
        const outcome = await settled(operation({
            rootRecipe: masking('root', {primary: recipeRef('child')}),
            loadRecipesById$: () => new Observable(subscriber => subscriber.error(failure))
        }))

        expect(outcome.error).toBe(failure)
        expect(outcome.emissions.at(-1)?.graph).toBeUndefined()
    })

    it('cancels its loader when the operation is unsubscribed', () => {
        const tornDown = jest.fn()
        const operation$ = operation({
            rootRecipe: masking('root', {primary: recipeRef('child')}),
            loadRecipesById$: () => new Observable(() => tornDown)
        })

        const subscription = operation$.subscribe({error: () => undefined})
        subscription.unsubscribe()

        expect(tornDown).toHaveBeenCalledTimes(1)
    })

    it('keeps overlapping operations and their teardown independent', () => {
        const requests = new Map()
        const loadRecipesById$ = ({ids}) => new Observable(subscriber => {
            const request = {subscriber, tornDown: jest.fn()}
            requests.set(ids[0], request)
            return request.tornDown
        })
        const first = operation({
            rootRecipe: masking('first', {primary: recipeRef('first-child')}),
            loadRecipesById$
        }).subscribe({error: () => undefined})
        operation({
            rootRecipe: masking('second', {primary: recipeRef('second-child')}),
            loadRecipesById$
        }).subscribe({error: () => undefined})

        first.unsubscribe()

        expect(requests.has('first-child')).toBe(true)
        expect(requests.has('second-child')).toBe(true)
        expect(requests.get('first-child').tornDown).toHaveBeenCalledTimes(1)
        expect(requests.get('second-child').tornDown).not.toHaveBeenCalled()
    })

    it('settles correctly when every frontier response is synchronous', async () => {
        const rootRecipe = masking('root', {primary: recipeRef('middle')})
        const middle = masking('middle', {primary: recipeRef('leaf')})
        const records = new Map([[middle.id, middle], ['leaf', slice('leaf')]])

        const outcome = await complete({
            rootRecipe,
            loadRecipesById$: ({ids}) => of(ids.map(id => records.get(id)))
        })

        expect(graphIds(outcome)).toEqual(['root', 'middle', 'leaf'])
    })
})
