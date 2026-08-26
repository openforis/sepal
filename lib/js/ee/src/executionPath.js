import {AsyncLocalStorage} from 'async_hooks'
import {Observable} from 'rxjs'

import {ClientException} from '#sepal/exception'
import {CYCLIC_DEPENDENCY} from '#sepal/recipe/source/diagnostic'

// The recipe ancestry of whatever is currently executing: the ids of the persisted recipes followed to reach
// it, outermost first.
//
// Held in AsyncLocalStorage rather than passed as a parameter because there is no parameter to pass it in.
// Every recipe implementation builds its children out of its own model - masking.js reads model.imageToMask,
// ccdcSlice.js reads model.source - so a value handed to one implementation cannot reach the next without
// every one of the forty-odd recursive call sites forwarding it. LandTrendr showed why enumerating those
// sites is not enforcement either: it recurses through toGeometry$ and getCollection$ without containing an
// imageFactory call at all. Ancestry therefore belongs to the two modules every recursion passes through.
//
// It must NOT go in the user-facing `...args`. masking.js deliberately forwards those to its primary input
// and withholds them from its mask, and ancestry must not inherit that asymmetry - a cycle through a mask is
// still a cycle.
const storage = new AsyncLocalStorage()

export const currentPath = () => storage.getStore() || []

export const withPath = (path, fn) => storage.run(path, fn)

// A cold Observable is built in one context and run in another: the implementation methods are constructed
// when a factory is created, while the callbacks that construct FURTHER factories - inside switchMap, map,
// defer - run when someone subscribes, possibly on a much later tick. Establishing the context around
// construction alone would lose it exactly where the recursion continues.
//
// So the source is subscribed under the child's path, which makes every continuation of that subscription -
// the HTTP response that resolves a referenced recipe, the map callback that turns it into a factory - see
// the ancestry it was reached by.
//
// And every notification is handed back under the CALLER's path. Without that, a child's ancestry leaks
// downstream: the parent's own operators run on the child's notification, and a parent that legitimately
// evaluates the same input a second time - a Classification reading its input imagery again for training
// data - would be told it had reached that input through itself. Two independent evaluations of one input
// are not a cycle; ancestry describes the path taken to reach a recipe, not how often a parent reads it.
//
// complete matters as much as next. Completion-driven operators emit downstream while PROCESSING a complete
// notification - toArray produces its value from it, as do reduce and last - so a parent operator reacting to
// that value, and any factory it builds, runs in whatever context the completion carried. Forwarding complete
// under the caller's path is what makes that work happen as the parent rather than as the child.
//
// The inner Subscription is returned as this Observable's teardown, so unsubscribing propagates and
// cancellation is unchanged. There is one subscription here, the caller's own.
//
// Recognized by having a `subscribe`, NOT by `instanceof Observable`. modules/gee, lib/js/ee and
// lib/js/shared each install their own rxjs, so an Observable built by the HTTP client in one of them fails
// an instanceof against the class imported here - and failing it silently returns the value unwrapped, which
// drops the ancestry exactly where a referenced recipe is loaded. Accessors also return plenty of things that
// are not Observables at all, such as the ee.Image classifyImage hands back, and those pass through.
const isSubscribable = value =>
    !!value && typeof value.subscribe === 'function'

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

// A ClientException, so the diagnosis survives the boundary. toException passes anything carrying
// `sepalException` through untouched; a plain Error is re-wrapped as a generic ServerException, which turns a
// recipe the user can fix into a 500 with no error code and the cycle buried in `cause`.
//
// `code` is the direct contract callers read; `errorCode` is the same value where the exception hierarchy
// carries it. The default 'Bad Request' user message stands: presenting this to a user is a separate change,
// and inventing a translation key here would be that change half-done.
export class CyclicDependencyException extends ClientException {
    constructor(recipePath) {
        super(`Recipe dependencies form a cycle: ${recipePath.join(' -> ')}`, {errorCode: CYCLIC_DEPENDENCY})
        this.name = 'CyclicDependencyException'
        this.code = CYCLIC_DEPENDENCY
        this.recipePath = recipePath
    }
}
