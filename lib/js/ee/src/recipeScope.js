import {AsyncLocalStorage} from 'async_hooks'
import {Observable, ReplaySubject, Subscription, throwError} from 'rxjs'

// The recipe reading of one execution operation: the reader it is authorized with, the records it has
// already read, and the loads still in flight.
//
// Held in AsyncLocalStorage for the same reason ancestry is: loadRecipe$ is reached from recipe
// implementations that build their children out of their own model, so there is no parameter to carry
// an operation in. The reader is captured here once, so a later operation configuring its own reader
// cannot change the authority a delayed read of this one is made with.
const storage = new AsyncLocalStorage()

export class RecipeScope {
    #read$
    #records = new Map()
    #loads = new Subscription()
    #closed = false

    constructor(read$) {
        this.#read$ = read$
    }

    // The record for this id, read at most once while the operation lasts. Callers arriving while a
    // read is in flight share it, and one of them unsubscribing does not cancel it for the others. A
    // read that fails is not retained: the failure reaches everyone waiting on it, and a later
    // attempt reads again rather than replaying it.
    read$(id) {
        if (this.#closed) {
            return throwError(() => new Error(`Operation ended before recipe was read: ${id}`))
        }
        return this.#records.get(id) ?? this.#retain(id)
    }

    // Ends the operation. Loads still in flight are unsubscribed and the records released, so a
    // response arriving afterwards reaches nobody.
    close() {
        this.#closed = true
        this.#records.clear()
        this.#loads.unsubscribe()
    }

    #retain(id) {
        const record$ = new ReplaySubject(1)
        const retained$ = record$.asObservable()
        this.#records.set(id, retained$)
        this.#loads.add(this.#read$(id).subscribe({
            next: record => record$.next(record),
            error: error => {
                this.#records.delete(id)
                record$.error(error)
            },
            complete: () => record$.complete()
        }))
        return retained$
    }
}

export const currentRecipeScope = () => storage.getStore() ?? null

// Establishes the operation around a subscription, so every continuation of it - including one that
// resolves on a much later tick - reads through this operation's reader and records.
export const inRecipeScope = (scope, source$) =>
    scope
        ? new Observable(subscriber => storage.run(scope, () => source$.subscribe(subscriber)))
        : source$

export const withRecipeScope = (scope, fn) => storage.run(scope, fn)
