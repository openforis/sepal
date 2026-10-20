import assert from 'node:assert/strict'
import {describe, it, mock} from 'node:test'

import {Observable, of} from 'rxjs'

import {
    completeRecipeClosure$,
    DEFAULT_RECIPE_CLOSURE_LIMITS as LIMITS
} from '#sepal/recipe/source/completeRecipeClosure'
import {assertMatches} from '#sepal/testSupport/assert'
import {callsOf} from '#sepal/testSupport/mock'

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

const operation = ({rootRecipe, seed = [], loadRecipesById$ = mock.fn(() => of([])), limits = LIMITS}) =>
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
    assert.equal(outcome.error, undefined)
    assert.equal(outcome.result?.status, 'COMPLETE')
    return outcome
}

const graphIds = ({result}) => result.graph.recipes.map(({id}) => id)
const catalogueIds = ({result}) => [...result.recipesById.keys()]

describe('completeRecipeClosure$', () => {
    it('publishes one immutable default limit configuration', () => {
        assert.deepEqual(LIMITS, {
            maxDepth: 16,
            maxNodes: 64,
            maxSerializedBytes: 8 * 1024 * 1024,
            maxLoadingRounds: 16,
            maxFrontierSize: 32,
            requestConcurrency: 4
        })
        assert.equal(Object.isFrozen(LIMITS), true)
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
        const loadRecipesById$ = mock.fn(() => of([slice('child')]))

        const operation$ = operation({rootRecipe, loadRecipesById$})

        assert.equal(modelReads, 0)
        assert.equal(loadRecipesById$.mock.callCount(), 0)
        operation$.subscribe({error: () => undefined})
        assert.ok(modelReads > 0)
    })

    it('returns a complete seeded graph without calling the recipe loader', async () => {
        const child = slice('child')
        const rootRecipe = masking('root', {primary: recipeRef('child')})
        const loadRecipesById$ = mock.fn()

        const outcome = await complete({rootRecipe, seed: [child], loadRecipesById$})

        assert.deepEqual(outcome.emissions.map(({status}) => status), ['COMPLETE'])
        assert.deepEqual(graphIds(outcome), ['root', 'child'])
        assert.equal(loadRecipesById$.mock.callCount(), 0)
    })

    it('loads one direct missing dependency', async () => {
        const rootRecipe = masking('root', {primary: recipeRef('child')})
        const child = slice('child')
        const loadRecipesById$ = mock.fn(({ids}) => of(ids.map(() => child)))

        const outcome = await complete({rootRecipe, loadRecipesById$})

        assert.deepEqual(callsOf(loadRecipesById$), [[{ids: ['child'], concurrency: 4}]])
        assert.deepEqual(outcome.emissions.map(({status}) => status), ['LOADING', 'COMPLETE'])
        assert.deepEqual(graphIds(outcome), ['root', 'child'])
    })

    it('loads a transitive chain in successive graph-derived frontiers', async () => {
        const rootRecipe = masking('root', {primary: recipeRef('middle')})
        const middle = masking('middle', {primary: recipeRef('leaf')})
        const leaf = slice('leaf')
        const records = new Map([[middle.id, middle], [leaf.id, leaf]])
        const loadRecipesById$ = mock.fn(({ids}) => of(ids.map(id => records.get(id))))

        const outcome = await complete({rootRecipe, loadRecipesById$})

        assert.deepEqual(callsOf(loadRecipesById$).map(([{ids}]) => ids), [['middle'], ['leaf']])
        assert.deepEqual(outcome.emissions.map(({status}) => status), ['LOADING', 'COMPLETE'])
        assert.deepEqual(graphIds(outcome), ['root', 'middle', 'leaf'])
    })

    it('uses successive captured-seed frontiers without emitting LOADING', async () => {
        const rootRecipe = masking('root', {primary: recipeRef('middle')})
        const middle = masking('middle', {primary: recipeRef('leaf')})
        const leaf = slice('leaf')
        const loadRecipesById$ = mock.fn()

        const outcome = await complete({rootRecipe, seed: [middle, leaf], loadRecipesById$})

        assert.deepEqual(outcome.emissions.map(({status}) => status), ['COMPLETE'])
        assert.equal(loadRecipesById$.mock.callCount(), 0)
        assert.deepEqual(graphIds(outcome), ['root', 'middle', 'leaf'])
    })

    it('deduplicates a diamond frontier and loads the shared dependency once', async () => {
        const rootRecipe = masking('root', {primary: recipeRef('left'), mask: recipeRef('right')})
        const left = masking('left', {primary: recipeRef('shared')})
        const right = masking('right', {primary: recipeRef('shared')})
        const shared = slice('shared')
        const records = new Map([left, right, shared].map(recipe => [recipe.id, recipe]))
        const loadRecipesById$ = mock.fn(({ids}) => of(ids.map(id => records.get(id))))

        const outcome = await complete({rootRecipe, loadRecipesById$})

        assert.deepEqual(
            callsOf(loadRecipesById$).map(([{ids}]) => ids),
            [['left', 'right'], ['shared']]
        )
        assert.deepEqual(graphIds(outcome), ['root', 'left', 'shared', 'right'])
    })

    it('returns an existing cycle immediately without loading', async () => {
        const rootRecipe = masking('root', {primary: recipeRef('root')})
        const loadRecipesById$ = mock.fn()

        const outcome = await complete({rootRecipe, loadRecipesById$})

        assertMatches(outcome.result.graph.diagnostics, [{
            code: 'CYCLIC_DEPENDENCY',
            recipePath: ['root', 'root']
        }])
        assert.equal(loadRecipesById$.mock.callCount(), 0)
    })

    it('stops after a loaded record reveals a cycle', async () => {
        const rootRecipe = masking('root', {primary: recipeRef('child')})
        const child = masking('child', {primary: recipeRef('root')})
        const loadRecipesById$ = mock.fn(() => of([child]))

        const outcome = await complete({rootRecipe, loadRecipesById$})

        assert.equal(loadRecipesById$.mock.callCount(), 1)
        assertMatches(outcome.result.graph.diagnostics, [{
            code: 'CYCLIC_DEPENDENCY',
            recipePath: ['root', 'child', 'root']
        }])
    })

    // A broken selection in one branch says nothing about whether another can be read, and a reader of that
    // other branch needs it.
    it('loads a missing sibling of a definitive diagnosis', async () => {
        const rootRecipe = masking('root', {
            primary: {type: 'RECIPE_REF'},
            mask: recipeRef('sibling')
        })
        const loadRecipesById$ = mock.fn(({ids}) => of(ids.map(id => masking(id))))

        const outcome = await complete({rootRecipe, loadRecipesById$})

        assert.deepEqual(
            callsOf(loadRecipesById$),
            [[{ids: ['sibling'], concurrency: LIMITS.requestConcurrency}]]
        )
        assert.deepEqual(graphIds(outcome), ['root', 'sibling'])
        assert.deepEqual(
            outcome.result.graph.diagnostics.map(({code}) => code),
            ['INCOMPLETE_REFERENCE']
        )
    })

    // Continuing to load can meet a failure where stopping would have returned the diagnosis. The failure is still
    // the operation's outcome; what was established before it arrives beside it, not inside it.
    it('fails with the loader error when a sibling of a definitive diagnosis cannot be read, keeping what it knew', async () => {
        const failure = Object.assign(new Error('recipe not found'), {status: 404})
        const rootRecipe = masking('root', {
            primary: {type: 'RECIPE_REF'},
            mask: recipeRef('sibling')
        })

        const outcome = await settled(operation({
            rootRecipe,
            loadRecipesById$: () => new Observable(subscriber => subscriber.error(failure))
        }))

        assert.equal(outcome.error, failure)
        assert.deepEqual(Object.keys(failure), ['status'])
        const failed = outcome.emissions.at(-1)
        assert.equal(failed.status, 'FAILED')
        assert.deepEqual(
            failed.graph.diagnostics.map(({code}) => code),
            ['INCOMPLETE_REFERENCE', 'MISSING_SOURCE']
        )
        assert.deepEqual([...failed.recipesById.keys()], ['root'])
    })

    it('keeps the exact root instead of a captured record with the same id', async () => {
        const currentChild = slice('current-child')
        const staleRoot = masking('root', {primary: recipeRef('stale-child')})
        const currentRoot = masking('root', {primary: recipeRef('current-child')})

        const outcome = await complete({rootRecipe: currentRoot, seed: [staleRoot, currentChild]})

        assert.deepEqual(graphIds(outcome), ['root', 'current-child'])
        assert.equal(outcome.result.graph.recipes[0], currentRoot)
        assert.equal(outcome.result.recipesById.get('root'), currentRoot)
    })

    it('uses matching captured-session records without replacing them from persistence', async () => {
        const captured = slice('captured')
        const rootRecipe = masking('root', {primary: recipeRef('captured'), mask: recipeRef('loaded')})
        const loaded = slice('loaded')
        const loadRecipesById$ = mock.fn(() => of([loaded]))

        const outcome = await complete({rootRecipe, seed: [captured], loadRecipesById$})

        assert.deepEqual(callsOf(loadRecipesById$), [[{ids: ['loaded'], concurrency: 4}]])
        assert.equal(outcome.result.recipesById.get('captured'), captured)
    })

    it('merges out-of-order batch results in deterministic frontier order', async () => {
        const rootRecipe = masking('root', {primary: recipeRef('left'), mask: recipeRef('right')})
        const left = slice('left')
        const right = slice('right')
        const loadRecipesById$ = mock.fn(() => of([right, left]))

        const outcome = await complete({rootRecipe, loadRecipesById$})

        assert.deepEqual(catalogueIds(outcome), ['root', 'left', 'right'])
        assert.deepEqual(graphIds(outcome), ['root', 'left', 'right'])
    })
})

describe('loader response validation', () => {
    const rootRecipe = masking('root', {primary: recipeRef('left'), mask: recipeRef('right')})
    const left = slice('left')
    const right = slice('right')

    for (const [name, {records, code}] of [
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
    ]) {
        it(`rejects ${name}`, async () => {
            const outcome = await settled(operation({
                rootRecipe,
                loadRecipesById$: () => of(records)
            }))

            assert.equal(outcome.result, undefined)
            assert.equal(outcome.error.code, code)
        })
    }

    it('rejects a selected captured-seed entry whose map key differs from the record id', async () => {
        const seed = new Map([['left', slice('different')]])
        const loadRecipesById$ = mock.fn()
        const outcome = await settled(operation({
            rootRecipe: masking('root', {primary: recipeRef('left')}),
            seed,
            loadRecipesById$
        }))

        assert.equal(outcome.error.code, 'RECIPE_CLOSURE_SEED_ID_MISMATCH')
        assert.equal(loadRecipesById$.mock.callCount(), 0)
    })

    it('passes a valid unsupported recipe type to the shared graph diagnostic', async () => {
        const rootRecipe = masking('root', {primary: recipeRef('retired')})
        const retired = {id: 'retired', type: 'RETIRED_RECIPE', model: {}}

        const outcome = await complete({
            rootRecipe,
            loadRecipesById$: () => of([retired])
        })

        assert.deepEqual(outcome.result.graph.diagnostics, [{
            code: 'UNSUPPORTED_RECIPE_TYPE',
            path: [],
            recipePath: ['root', 'retired']
        }])
        assert.equal(outcome.result.recipesById.get('retired'), retired)
    })
})

describe('closure resource limits', () => {
    const expectLimit = async ({rootRecipe, records = [], seed = [], limits, code}) => {
        const recordsById = new Map(records.map(recipe => [recipe.id, recipe]))
        const loadRecipesById$ = mock.fn(({ids}) => of(ids.map(id => recordsById.get(id))))
        const outcome = await settled(operation({rootRecipe, seed, loadRecipesById$, limits: {...LIMITS, ...limits}}))
        assert.equal(outcome.error.code, code)
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
        assert.deepEqual(callsOf(loadRecipesById$).map(([{ids}]) => ids), [['middle']])
    })

    it('enforces maximum node count including the root before loading another node', async () => {
        const {loadRecipesById$} = await expectLimit({
            rootRecipe: masking('root', {primary: recipeRef('child')}),
            records: [slice('child')],
            limits: {maxNodes: 1},
            code: 'RECIPE_CLOSURE_NODE_LIMIT'
        })
        assert.equal(loadRecipesById$.mock.callCount(), 0)
    })

    it('enforces serialized UTF-8 bytes rather than JavaScript string length', async () => {
        const rootRecipe = masking('root')
        rootRecipe.label = '🌳'.repeat(20)
        const serialized = JSON.stringify(rootRecipe)
        const utf8Bytes = new TextEncoder().encode(serialized).length
        assert.ok(utf8Bytes > serialized.length)

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

        assert.deepEqual(catalogueIds(outcome), ['root'])
        assert.equal(outcome.result.recipesById.has('unrelated'), false)
    })

    it('enforces loading rounds before starting the prohibited next round', async () => {
        const middle = masking('middle', {primary: recipeRef('leaf')})
        const {loadRecipesById$} = await expectLimit({
            rootRecipe: masking('root', {primary: recipeRef('middle')}),
            records: [middle, slice('leaf')],
            limits: {maxLoadingRounds: 1},
            code: 'RECIPE_CLOSURE_LOADING_ROUND_LIMIT'
        })
        assert.deepEqual(callsOf(loadRecipesById$).map(([{ids}]) => ids), [['middle']])
    })

    it('enforces frontier width before invoking the loader', async () => {
        const {loadRecipesById$} = await expectLimit({
            rootRecipe: masking('root', {primary: recipeRef('left'), mask: recipeRef('right')}),
            records: [slice('left'), slice('right')],
            limits: {maxFrontierSize: 1},
            code: 'RECIPE_CLOSURE_FRONTIER_LIMIT'
        })
        assert.equal(loadRecipesById$.mock.callCount(), 0)
    })

    it('passes the finite request-concurrency limit to each logical frontier', async () => {
        const loadRecipesById$ = mock.fn(() => of([slice('child')]))
        await complete({
            rootRecipe: masking('root', {primary: recipeRef('child')}),
            loadRecipesById$,
            limits: {...LIMITS, requestConcurrency: 2}
        })
        assert.deepEqual(callsOf(loadRecipesById$), [[{ids: ['child'], concurrency: 2}]])
    })

    for (const field of Object.keys(LIMITS)) {
        it(`rejects a missing ${field} limit field`, async () => {
            const limits = {...LIMITS}
            delete limits[field]
            const outcome = await settled(operation({rootRecipe: masking('root'), limits}))

            assert.equal(outcome.error.code, 'RECIPE_CLOSURE_INVALID_LIMITS')
        })
    }

    for (const [scenario, limits] of [
        ['a null configuration', null],
        ['an empty configuration', {}],
        ['a zero value', {...LIMITS, maxNodes: 0}],
        ['a negative value', {...LIMITS, maxNodes: -1}],
        ['a fractional value', {...LIMITS, maxNodes: 1.5}],
        ['an infinite value', {...LIMITS, maxNodes: Infinity}],
        ['a string value', {...LIMITS, maxNodes: '4'}]
    ]) {
        it(`rejects ${scenario} with a controlled error`, async () => {
            const outcome = await settled(operation({rootRecipe: masking('root'), limits}))

            assert.equal(outcome.error.code, 'RECIPE_CLOSURE_INVALID_LIMITS')
        })
    }
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

        assert.deepEqual([...seed.entries()], before)
        assert.notEqual(outcome.result.recipesById, seed)
        assert.deepEqual(catalogueIds(outcome), ['root', 'child'])
        assert.equal(outcome.result.recipesById.get('root'), rootRecipe)
        assert.equal(outcome.result.recipesById.get('child'), child)
        assert.equal(outcome.result.recipesById.has('unreachable'), false)
    })

    it('returns a newly owned catalogue for every subscription while retaining record identity', async () => {
        const rootRecipe = masking('root', {primary: recipeRef('child')})
        const child = slice('child')
        const operation$ = operation({rootRecipe, seed: [child]})
        const first = await settled(operation$)
        const second = await settled(operation$)

        assert.notEqual(first.result.recipesById, second.result.recipesById)
        assert.equal(first.result.recipesById.get('root'), rootRecipe)
        assert.equal(second.result.recipesById.get('root'), rootRecipe)
        assert.equal(first.result.recipesById.get('child'), child)
        assert.equal(second.result.recipesById.get('child'), child)
    })

    it('retains loaded record identity in its owned catalogue', async () => {
        const rootRecipe = masking('root', {primary: recipeRef('child')})
        const child = slice('child')

        const outcome = await complete({
            rootRecipe,
            loadRecipesById$: () => of([child])
        })

        assert.equal(outcome.result.recipesById.get('root'), rootRecipe)
        assert.equal(outcome.result.recipesById.get('child'), child)
    })

    it('propagates a loader failure without converting it into graph evidence', async () => {
        const failure = Object.assign(new Error('forbidden'), {status: 403})
        const outcome = await settled(operation({
            rootRecipe: masking('root', {primary: recipeRef('child')}),
            loadRecipesById$: () => new Observable(subscriber => subscriber.error(failure))
        }))

        assert.equal(outcome.error, failure)
        assert.ok(!outcome.emissions.map(({status}) => status).includes('COMPLETE'))
        assert.equal(outcome.emissions.at(-1).status, 'FAILED')
    })

    it('cancels its loader when the operation is unsubscribed', () => {
        const tornDown = mock.fn()
        const operation$ = operation({
            rootRecipe: masking('root', {primary: recipeRef('child')}),
            loadRecipesById$: () => new Observable(() => tornDown)
        })

        const subscription = operation$.subscribe({error: () => undefined})
        subscription.unsubscribe()

        assert.equal(tornDown.mock.callCount(), 1)
    })

    it('keeps overlapping operations and their teardown independent', () => {
        const requests = new Map()
        const loadRecipesById$ = ({ids}) => new Observable(subscriber => {
            const request = {subscriber, tornDown: mock.fn()}
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

        assert.equal(requests.has('first-child'), true)
        assert.equal(requests.has('second-child'), true)
        assert.equal(requests.get('first-child').tornDown.mock.callCount(), 1)
        assert.equal(requests.get('second-child').tornDown.mock.callCount(), 0)
    })

    it('settles correctly when every frontier response is synchronous', async () => {
        const rootRecipe = masking('root', {primary: recipeRef('middle')})
        const middle = masking('middle', {primary: recipeRef('leaf')})
        const records = new Map([[middle.id, middle], ['leaf', slice('leaf')]])

        const outcome = await complete({
            rootRecipe,
            loadRecipesById$: ({ids}) => of(ids.map(id => records.get(id)))
        })

        assert.deepEqual(graphIds(outcome), ['root', 'middle', 'leaf'])
    })
})
