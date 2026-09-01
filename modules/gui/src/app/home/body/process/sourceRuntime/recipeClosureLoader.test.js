import {Observable} from 'rxjs'
import {beforeEach, describe, expect, it} from 'vitest'

import {createLoadRecipesById$} from './recipeClosureLoader'

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

        expect(state.calls).toEqual([])
        operation$.subscribe({error: () => undefined})
        expect(state.calls).toEqual(['a'])
    })

    it('bounds request concurrency and emits records in frontier order despite out-of-order completion', () => {
        const results = []
        let completed = false
        loadRecipesById$()({ids: ['a', 'b', 'c'], concurrency: 2}).subscribe({
            next: records => results.push(records),
            error: () => undefined,
            complete: () => completed = true
        })

        expect(state.calls).toEqual(['a', 'b'])
        respond('b')
        expect(state.calls).toEqual(['a', 'b', 'c'])
        respond('c')
        respond('a')

        expect(results).toEqual([[recipe('a'), recipe('b'), recipe('c')]])
        expect(completed).toBe(true)
    })

    it('rejects a response whose record id does not match its request and cancels siblings', () => {
        let error
        loadRecipesById$()({ids: ['a', 'b'], concurrency: 2}).subscribe({
            error: failure => error = failure
        })

        respond('a', recipe('different'))

        expect(error).toEqual(expect.objectContaining({code: 'RECIPE_CLOSURE_MISMATCHED_RECORD'}))
        expect(state.tornDown).toContain('b')
    })

    it.each([
        ['a primitive response', 7],
        ['a response without an id', {type: 'CCDC_SLICE', model: {}}],
        ['a response with a non-string id', {id: 7, type: 'CCDC_SLICE', model: {}}],
        ['a response with a blank id', {id: ' ', type: 'CCDC_SLICE', model: {}}]
    ])('rejects %s before ordered batch publication', (_name, response) => {
        let error
        loadRecipesById$()({ids: ['a'], concurrency: 1}).subscribe({
            error: failure => error = failure
        })

        respond('a', response)

        expect(error).toEqual(expect.objectContaining({code: 'RECIPE_CLOSURE_MALFORMED_RECORD'}))
    })

    it('rejects a request that completes without one record', () => {
        let error
        loadRecipesById$()({ids: ['a'], concurrency: 1}).subscribe({
            error: failure => error = failure
        })

        state.requests.get('a')?.complete()

        expect(error).toEqual(expect.objectContaining({code: 'RECIPE_CLOSURE_MISSING_RECORD'}))
    })

    it('rejects a request that emits duplicate records', () => {
        let error
        loadRecipesById$()({ids: ['a'], concurrency: 1}).subscribe({
            error: failure => error = failure
        })

        state.requests.get('a')?.next(recipe('a'))
        state.requests.get('a')?.next(recipe('a'))

        expect(error).toEqual(expect.objectContaining({code: 'RECIPE_CLOSURE_DUPLICATE_RECORD'}))
    })

    it('propagates a forbidden or missing transport failure and tears down siblings', () => {
        const failure = Object.assign(new Error('forbidden'), {status: 403})
        let error
        loadRecipesById$()({ids: ['a', 'b'], concurrency: 2}).subscribe({
            error: caught => error = caught
        })

        state.requests.get('a')?.error(failure)

        expect(error).toBe(failure)
        expect(state.tornDown).toContain('b')
    })

    it('cancels every active sibling request on unsubscription', () => {
        const subscription = loadRecipesById$()({ids: ['a', 'b', 'c'], concurrency: 2}).subscribe({
            error: () => undefined
        })

        subscription.unsubscribe()

        expect(state.calls).toEqual(['a', 'b'])
        expect(state.tornDown).toEqual(expect.arrayContaining(['a', 'b']))
        expect(state.calls).not.toContain('c')
    })
})
