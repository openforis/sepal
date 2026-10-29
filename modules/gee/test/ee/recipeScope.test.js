import assert from 'node:assert/strict'
import {AsyncLocalStorage} from 'node:async_hooks'
import {describe, it} from 'node:test'

import {map, Observable, throwError, toArray} from 'rxjs'

import {currentPath, withPath} from '#sepal/ee/executionPath'
import {currentRecipeScope, RecipeScope, withRecipeScope} from '#sepal/ee/recipeScope'

// What a retained read of an execution operation delivers, and in which context: the read is shared, but each
// subscriber receives next, error and complete in the asynchronous context it subscribed in - its recipe ancestry,
// its operation and any other context it runs with - never the one the answer arrived in. Recipe records and GeoID
// features are retained by the same scope (recipeScope.js), so each case is read both ways. The reader here answers
// only when told to, from a context of its own, as a transport's message handler would.

const KINDS = [
    {kind: 'recipe record', read: (scope, key) => scope.read$(key), scopeOf: read$ => new RecipeScope(read$)},
    {kind: 'GeoID feature', read: (scope, key) => scope.geoIdFeature$(key), scopeOf: read$ => new RecipeScope(NO_RECIPES, {geoIdFeature$: read$})}
]

for (const {kind, read, scopeOf} of KINDS) {
    describe(`a ${kind} two branches of one operation wait on`, () => {
        it('reaches each branch with the answer and its completion in that branch\'s own context, from one read', () => {
            const reader = delayedReader()
            const scope = scopeOf(reader.read$)
            const events = []

            inBranch(scope, 'first', () => follow(read(scope, KEY), 'first', events, scope))
            inBranch(scope, 'second', () => follow(read(scope, KEY), 'second', events, scope))
            reader.answer(0, ANSWER)

            assert.equal(reader.requests.length, 1)
            assert.deepEqual(events, [
                delivered('first', 'next', ANSWER), delivered('second', 'next', ANSWER),
                delivered('first', 'complete'), delivered('second', 'complete')
            ])
        })

        it('reaches each branch with a failure in that branch\'s own context, and a later read asks again', () => {
            const reader = delayedReader()
            const scope = scopeOf(reader.read$)
            const events = []
            inBranch(scope, 'first', () => follow(read(scope, KEY), 'first', events, scope))
            inBranch(scope, 'second', () => follow(read(scope, KEY), 'second', events, scope))

            reader.fail(0, FAILURE)
            inBranch(scope, 'third', () => follow(read(scope, KEY), 'third', events, scope))
            reader.answer(1, ANSWER)

            assert.equal(reader.requests.length, 2)
            assert.deepEqual(events, [
                delivered('first', 'error', FAILURE), delivered('second', 'error', FAILURE),
                delivered('third', 'next', ANSWER), delivered('third', 'complete')
            ])
        })

        // Work a branch does once the read completes - collecting it, then continuing - is still that branch's: this is
        // how a recipe reached through two branches came to see itself in its own ancestry.
        it('continues what each branch does on completion in that branch\'s own context', () => {
            const reader = delayedReader()
            const scope = scopeOf(reader.read$)
            const continued = []

            for (const branch of ['first', 'second']) {
                inBranch(scope, branch, () => read(scope, KEY).pipe(toArray(), map(() => contextNow(scope)))
                    .subscribe(context => continued.push({branch, ...context})))
            }
            reader.answer(0, ANSWER)

            assert.deepEqual(continued, ['first', 'second'].map(branch => ({branch, path: [branch], other: branch, inScope: true})))
        })

        it('keeps reading for one branch when the other stops waiting', () => {
            const reader = delayedReader()
            const scope = scopeOf(reader.read$)
            const events = []
            const leaving = inBranch(scope, 'first', () => follow(read(scope, KEY), 'first', events, scope))
            inBranch(scope, 'second', () => follow(read(scope, KEY), 'second', events, scope))

            leaving.unsubscribe()
            const stillReading = !reader.requests[0].tornDown
            reader.answer(0, ANSWER)

            assert.equal(stillReading, true)
            assert.deepEqual(events, [delivered('second', 'next', ANSWER), delivered('second', 'complete')])
        })

        it('is torn down when the operation ends, and a late answer reaches nobody', () => {
            const reader = delayedReader()
            const scope = scopeOf(reader.read$)
            const events = []
            inBranch(scope, 'first', () => follow(read(scope, KEY), 'first', events, scope))

            scope.close()
            reader.answer(0, ANSWER)

            assert.equal(reader.requests[0].tornDown, true)
            assert.deepEqual(events, [])
        })
    })

    describe(`a ${kind} read obtained in one branch and subscribed in another`, () => {
        it('reaches the branch that subscribed, not the one that obtained it', () => {
            const reader = delayedReader()
            const scope = scopeOf(reader.read$)
            const events = []

            const answer$ = inBranch(scope, 'obtaining', () => read(scope, KEY))
            inBranch(scope, 'subscribing', () => follow(answer$, 'subscribing', events, scope))
            reader.answer(0, ANSWER)

            assert.deepEqual(events, [delivered('subscribing', 'next', ANSWER), delivered('subscribing', 'complete')])
        })
    })

    describe(`a ${kind} already read`, () => {
        it('is replayed to a later branch in that branch\'s own context, without reading again', () => {
            const reader = delayedReader()
            const scope = scopeOf(reader.read$)
            const events = []
            inBranch(scope, 'first', () => follow(read(scope, KEY), 'first', events, scope))
            reader.answer(0, ANSWER)

            inBranch(scope, 'later', () => follow(read(scope, KEY), 'later', events, scope))

            assert.equal(reader.requests.length, 1)
            assert.deepEqual(events.slice(2), [delivered('later', 'next', ANSWER), delivered('later', 'complete')])
        })
    })
}

const KEY = 'shared'
const ANSWER = {id: KEY}
const FAILURE = new Error('Read failed')

const NO_RECIPES = id => throwError(() => new Error(`No recipe read expected: ${id}`))

// A context of its own beside ancestry and the operation, so what survives is the whole context, not those two.
const other = new AsyncLocalStorage()

const inBranch = (scope, branch, fn) =>
    withRecipeScope(scope, () => other.run(branch, () => withPath([branch], fn)))

const contextNow = scope => ({path: currentPath(), other: other.getStore() ?? null, inScope: currentRecipeScope() === scope})

// Each notification as the branch saw it: the path, the other context and whether the operation is still `scope`.
const follow = (answer$, branch, events, scope) => answer$.subscribe({
    next: value => events.push({branch, kind: 'next', value, ...contextNow(scope)}),
    error: error => events.push({branch, kind: 'error', value: error, ...contextNow(scope)}),
    complete: () => events.push({branch, kind: 'complete', ...contextNow(scope)})
})

const delivered = (branch, kind, value) => ({
    branch, kind, ...(value === undefined ? {} : {value}), path: [branch], other: branch, inScope: true
})

// Reads that answer only when the test says so, from the reader's own context - a transport's handler, in effect - so
// whatever context a notification carries is visibly not the one it was produced in.
const delayedReader = () => {
    const requests = []
    const fromReader = fn => other.run('reader', () => withPath(['reader'], fn))
    return {
        requests,
        read$: key => new Observable(subscriber => {
            const request = {key, tornDown: false, subscriber}
            requests.push(request)
            return () => request.tornDown = true
        }),
        answer: (index, value) => fromReader(() => {
            const {subscriber} = requests[index]
            subscriber.next(value)
            subscriber.complete()
        }),
        fail: (index, error) => fromReader(() => requests[index].subscriber.error(error))
    }
}
