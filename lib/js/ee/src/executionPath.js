import {AsyncLocalStorage} from 'async_hooks'
import {Observable} from 'rxjs'

import {ClientException} from '#sepal/exception'
import {CYCLIC_DEPENDENCY} from '#sepal/recipe/source/diagnostic'

// The recipe ancestry of whatever is currently executing: the ids of the persisted recipes followed to reach
// it, outermost first.
//
// Held in AsyncLocalStorage because there is no parameter to carry it in: every recipe implementation builds
// its children out of its own model, and some recurse without calling imageFactory at all. It must not ride
// in the user-facing `...args` either, which masking.js withholds from its mask - a cycle through a mask is
// still a cycle.
const storage = new AsyncLocalStorage()

export const currentPath = () => storage.getStore() || []

export const withPath = (path, fn) => storage.run(path, fn)

// Structural, not `instanceof Observable`: modules/gee, lib/js/ee and lib/js/shared each install their own
// rxjs, and an instanceof against the class imported here would silently pass a foreign Observable through
// unwrapped. Values that are not observables at all pass through unchanged.
const isSubscribable = value =>
    !!value && typeof value.subscribe === 'function'

// Ancestry belongs to the branch that is reading, and a shared record emits in the context of whichever
// branch's read produced it, so each notification is re-established in the path of the subscriber receiving
// it.
export const inCurrentPath = source$ => new Observable(subscriber => {
    const path = currentPath()
    return source$.subscribe({
        next: value => withPath(path, () => subscriber.next(value)),
        error: error => withPath(path, () => subscriber.error(error)),
        complete: () => withPath(path, () => subscriber.complete())
    })
})

// Subscribed under the child's path - a cold Observable is built in one context and run in another, and the
// callbacks that continue the recursion run at subscribe, possibly on a much later tick.
//
// Every notification, complete included, is handed back under the CALLER's path: completion-driven operators
// emit downstream while processing it, and a parent that legitimately evaluates the same input twice must not
// be told it reached that input through itself.
export const inPath = (path, value) =>
    isSubscribable(value)
        ? new Observable(subscriber => {
            const resumePath = currentPath()
            return withPath(path, () => value.subscribe({
                next: emitted => withPath(resumePath, () => subscriber.next(emitted)),
                error: error => withPath(resumePath, () => subscriber.error(error)),
                complete: () => withPath(resumePath, () => subscriber.complete())
            }))
        })
        : value

// A ClientException, so the diagnosis survives toException: a plain Error is re-wrapped as a generic
// ServerException, turning a recipe the user can fix into a 500 with the cycle buried in `cause`.
export class CyclicDependencyException extends ClientException {
    constructor(recipePath) {
        super(`Recipe dependencies form a cycle: ${recipePath.join(' -> ')}`, {errorCode: CYCLIC_DEPENDENCY})
        this.name = 'CyclicDependencyException'
        this.code = CYCLIC_DEPENDENCY
        this.recipePath = recipePath
    }
}
