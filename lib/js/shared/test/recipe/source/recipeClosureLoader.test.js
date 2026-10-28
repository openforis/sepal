import assert from 'node:assert/strict'
import {beforeEach, describe, it} from 'node:test'
import {format, isDeepStrictEqual} from 'node:util'

import {Observable} from 'rxjs'

import {createLoadRecipesById$} from '#sepal/recipe/source/recipeClosureLoader'
import {assertMatches} from '#sepal/testSupport/assert'

const state = {
    calls: [],
    requests: new Map(),
    tornDown: []
}

const recipe = id => ({id, type: 'CCDC_SLICE', model: {}})

const loadRecipe$ = id => {
    state.calls.push(id)
    return new Observable(subscriber => {
        state.requests.set(id, subscriber)
        return () => state.tornDown.push(id)
    })
}

const loadRecipesById$ = () => createLoadRecipesById$({loadRecipe$})

const respond = (requestedId, record = recipe(requestedId)) => {
    state.requests.get(requestedId)?.next(record)
    state.requests.get(requestedId)?.complete()
}

beforeEach(() => {
    state.calls = []
    state.requests = new Map()
    state.tornDown = []
})

describe('createLoadRecipesById$', () => {
    it('does not call the authenticated recipe API before subscription', () => {
        const operation$ = loadRecipesById$()({ids: ['a'], concurrency: 2})

        assert.deepEqual(state.calls, [])
        operation$.subscribe({error: () => undefined})
        assert.deepEqual(state.calls, ['a'])
    })

    it('bounds request concurrency and emits records in frontier order despite out-of-order completion', () => {
        const results = []
        let completed = false
        loadRecipesById$()({ids: ['a', 'b', 'c'], concurrency: 2}).subscribe({
            next: records => results.push(records),
            error: () => undefined,
            complete: () => completed = true
        })

        assert.deepEqual(state.calls, ['a', 'b'])
        respond('b')
        assert.deepEqual(state.calls, ['a', 'b', 'c'])
        respond('c')
        respond('a')

        assert.deepEqual(results, [[recipe('a'), recipe('b'), recipe('c')]])
        assert.equal(completed, true)
    })

    it('rejects a response whose record id does not match its request and cancels siblings', () => {
        let error
        loadRecipesById$()({ids: ['a', 'b'], concurrency: 2}).subscribe({
            error: failure => error = failure
        })

        respond('a', recipe('different'))

        assertMatches(error, {code: 'RECIPE_CLOSURE_MISMATCHED_RECORD'})
        assert.ok((state.tornDown).includes('b'))
    })

    for (const [_name, response] of [
        ['a primitive response', 7],
        ['a response without an id', {type: 'CCDC_SLICE', model: {}}],
        ['a response with a non-string id', {id: 7, type: 'CCDC_SLICE', model: {}}],
        ['a response with a blank id', {id: ' ', type: 'CCDC_SLICE', model: {}}]
    ]) {
        it(format('rejects %s before ordered batch publication', _name), () => {
            let error
            loadRecipesById$()({ids: ['a'], concurrency: 1}).subscribe({
                error: failure => error = failure
            })

            respond('a', response)

            assertMatches(error, {code: 'RECIPE_CLOSURE_MALFORMED_RECORD'})
        })
    }

    it('rejects a request that completes without one record', () => {
        let error
        loadRecipesById$()({ids: ['a'], concurrency: 1}).subscribe({
            error: failure => error = failure
        })

        state.requests.get('a')?.complete()

        assertMatches(error, {code: 'RECIPE_CLOSURE_MISSING_RECORD'})
    })

    it('rejects a request that emits duplicate records', () => {
        let error
        loadRecipesById$()({ids: ['a'], concurrency: 1}).subscribe({
            error: failure => error = failure
        })

        state.requests.get('a')?.next(recipe('a'))
        state.requests.get('a')?.next(recipe('a'))

        assertMatches(error, {code: 'RECIPE_CLOSURE_DUPLICATE_RECORD'})
    })

    for (const [message, status] of [
        ['forbidden', 403],
        ['not found', 404],
        ['unavailable', 503]
    ]) {
        it(format('fails at once when a record is %s, naming it, and tears down siblings still being read', message), () => {
            const failure = Object.assign(new Error(message), {status})
            let error
            loadRecipesById$()({ids: ['a', 'b'], concurrency: 2}).subscribe({
                error: caught => error = caught
            })

            state.requests.get('a')?.error(failure)

            assertMatches(error, {recipeId: 'a', status, message, cause: failure})
            assert.ok((state.tornDown).includes('b'))
        })
    }

    it('cancels every active sibling request on unsubscription', () => {
        const subscription = loadRecipesById$()({ids: ['a', 'b', 'c'], concurrency: 2}).subscribe({
            error: () => undefined
        })

        subscription.unsubscribe()

        assert.deepEqual(state.calls, ['a', 'b'])
        assert.ok((['a', 'b']).every(expected => (state.tornDown).some(actual => isDeepStrictEqual(actual, expected))))
        assert.ok(!(state.calls).includes('c'))
    })
})
