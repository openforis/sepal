import {Observable} from 'rxjs'
import {describe, expect, it} from 'vitest'

import {OutputAcquisition} from './outputAcquisition'
import {recipeContent} from './recipeContent'

// The lifetime owner of a layer's output acquisition, against a controllable runtime: its two operations and its
// credential epochs are driven by hand, so each ordering the contract names can be produced exactly. The real
// runtime's own ordering is proven in sourceRuntime.test.js and sourceRuntimeContext.test.jsx.
//
// Error codes and kinds are literals, so a production rename cannot pass unnoticed.

describe('what is started', () => {
    it('describes the output for a description it needs', () => {
        const {operations} = owned({acquisition: describing()})

        expect(operations.map(({kind}) => kind)).toEqual(['DESCRIBE'])
    })

    it('only completes dependencies where validity is all that is missing', () => {
        const {operations} = owned({acquisition: {kind: 'DEPENDENCIES', key: keyOf('DEPENDENCIES')}})

        expect(operations.map(({kind}) => kind)).toEqual(['DEPENDENCIES'])
    })

    it('starts nothing again for the key it is already acquiring or holds', () => {
        const {owner, operations, settle} = owned({acquisition: describing()})

        owner.update(describing(), RECIPE)
        settle(operations[0], ready())
        owner.update(describing(), RECIPE)

        expect(operations).toHaveLength(1)
    })

    it('replaces work in flight when the key moves, and never retains the replaced answer', () => {
        const {owner, operations, settle} = owned({acquisition: describing()})

        owner.update(describing(EDITED), EDITED)
        settle(operations[0], ready())

        expect(operations).toHaveLength(2)
        expect(operations[0].torndown).toBe(true)
        expect(owner.heldFor(keyOf('DESCRIBE'))).toBeNull()
    })

    it('releases everything, credentials included, once nothing is needed', () => {
        const {owner, runtime, operations} = owned({acquisition: describing()})

        owner.update(null, RECIPE)

        expect(operations[0].torndown).toBe(true)
        expect(runtime.identityListeners()).toBe(0)
    })
})

describe('what is retained', () => {
    it('is the terminal for the key it was started under', () => {
        const {owner, operations, settle, changes} = owned({acquisition: describing()})
        const terminal = ready()

        settle(operations[0], terminal)

        expect(owner.heldFor(keyOf('DESCRIBE'))).toBe(terminal)
        expect(owner.heldFor(keyOf('DESCRIBE', EDITED))).toBeNull()
        expect(changes()).toBe(1)
    })

    it('is not a terminal about records the session has since replaced, and that key is not tried again', () => {
        let current = [RECIPE]
        const {owner, operations, settle} = owned({acquisition: describing(), currentGraph: () => ({recipes: current})})

        current = [EDITED]
        settle(operations[0], ready())
        owner.update(describing(), RECIPE)

        expect(owner.heldFor(keyOf('DESCRIBE'))).toBeNull()
        expect(operations).toHaveLength(1)

        owner.update(describing(EDITED), EDITED)
        expect(operations).toHaveLength(2)
    })

    it('holds a terminal that settles inside its own subscription, once, when the change handler reacts at once', () => {
        const runtime = runtimeOf({synchronous: ready()})
        let owner = null
        owner = new OutputAcquisition({
            sourceRuntime: runtime.sourceRuntime,
            currentGraph: () => ({recipes: [RECIPE]}),
            onChange: () => owner.update(describing(), RECIPE)
        })

        owner.update(describing(), RECIPE)

        expect(runtime.operations).toHaveLength(1)
        expect(owner.heldFor(keyOf('DESCRIBE'))).toEqual(ready())
    })
})

describe('a credential change', () => {
    it('drops what was retained and acquires exactly once again', () => {
        const {owner, runtime, operations, settle, changes} = owned({acquisition: describing()})
        settle(operations[0], ready())

        runtime.changeCredentials()

        expect(owner.heldFor(keyOf('DESCRIBE'))).toBeNull()
        expect(operations).toHaveLength(2)
        expect(changes()).toBe(2)
    })

    it('replaces work in flight once when the credential epoch is heard first', () => {
        const {owner, runtime, operations, settle} = owned({acquisition: describing()})

        runtime.changeCredentials()
        settle(operations[0], identityChanged())
        owner.update(describing(), RECIPE)

        expect(operations).toHaveLength(2)
        expect(operations[0].torndown).toBe(true)
        expect(owner.heldFor(keyOf('DESCRIBE'))).toBeNull()
    })

    it('replaces work in flight once when the operation reports the change first', () => {
        const {owner, runtime, operations, settle} = owned({acquisition: describing()})

        settle(operations[0], identityChanged())
        expect(operations).toHaveLength(1)
        runtime.changeCredentials()
        owner.update(describing(), RECIPE)

        expect(operations).toHaveLength(2)
        expect(owner.heldFor(keyOf('DESCRIBE'))).toBeNull()
    })
})

describe('the runtime scope ending', () => {
    it('drops what was retained and stops for good when the credential watch ends', () => {
        const {owner, runtime, operations, settle} = owned({acquisition: describing()})
        settle(operations[0], ready())

        runtime.close()
        owner.update(describing(), RECIPE)

        expect(owner.heldFor(keyOf('DESCRIBE'))).toBeNull()
        expect(operations).toHaveLength(1)
    })

    it('stops for good when the operation reports it first, releasing the credential watch', () => {
        const {owner, runtime, operations, settle} = owned({acquisition: describing()})

        settle(operations[0], runtimeClosed())
        owner.update(describing(), RECIPE)

        expect(operations).toHaveLength(1)
        expect(runtime.identityListeners()).toBe(0)
    })

    it('stops work in flight when the credential watch ends first', () => {
        const {runtime, operations} = owned({acquisition: describing()})

        runtime.close()

        expect(operations[0].torndown).toBe(true)
    })
})

const RECIPE = {id: 'recipe-1', type: 'MASKING', model: {}}
const EDITED = {...RECIPE, model: {edited: true}}

const keyOf = (kind, recipe = RECIPE) => ({kind, content: [recipeContent(recipe)]})

const describing = (recipe = RECIPE) => ({kind: 'DESCRIBE', key: keyOf('DESCRIBE', recipe)})

const ready = () => ({
    status: 'READY',
    description: {output: {bands: []}},
    diagnostics: [],
    error: null,
    dependencyValidity: {status: 'VALID', diagnostics: []},
    basis: [{id: RECIPE.id, content: recipeContent(RECIPE)}]
})

const identityChanged = () => ({
    status: 'UNAVAILABLE', description: null, diagnostics: [], error: {code: 'SOURCE_IDENTITY_CHANGED'},
    dependencyValidity: null, basis: []
})

const runtimeClosed = () => ({
    status: 'UNAVAILABLE', description: null, diagnostics: [], error: {code: 'SOURCE_RUNTIME_UNAVAILABLE'},
    dependencyValidity: null, basis: []
})

const runtimeOf = ({synchronous} = {}) => {
    const operations = []
    const listeners = new Set()
    let closed = false
    const operation = kind => ({recipe}) => new Observable(subscriber => {
        const entry = {kind, recipe, subscriber, torndown: false}
        operations.push(entry)
        if (synchronous) {
            subscriber.next(synchronous)
            subscriber.complete()
        }
        return () => entry.torndown = true
    })
    return {
        operations,
        sourceRuntime: {
            resolveImageOutput$: operation('DESCRIBE'),
            completeDependencies$: operation('DEPENDENCIES'),
            identity$: () => new Observable(subscriber => {
                if (closed) {
                    return subscriber.complete()
                }
                listeners.add(subscriber)
                subscriber.next({})
                return () => listeners.delete(subscriber)
            })
        },
        changeCredentials: () => [...listeners].forEach(listener => listener.next({})),
        close: () => {
            closed = true
            ;[...listeners].forEach(listener => listener.complete())
        },
        identityListeners: () => listeners.size
    }
}

const owned = ({acquisition, currentGraph = () => ({recipes: [RECIPE]})}) => {
    const runtime = runtimeOf()
    let changes = 0
    const owner = new OutputAcquisition({sourceRuntime: runtime.sourceRuntime, currentGraph, onChange: () => changes++})
    owner.update(acquisition, RECIPE)
    const settle = ({subscriber}, terminal) => {
        subscriber.next(terminal)
        subscriber.complete()
    }
    return {owner, runtime, operations: runtime.operations, settle, changes: () => changes}
}
