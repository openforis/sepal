import {AsyncLocalStorage} from 'async_hooks'
import {Observable, ReplaySubject, Subscription, throwError} from 'rxjs'

// The external reads of one execution operation: the recipe reader it is authorized with, the GeoID reader
// it resolves GeoID areas of interest with, what it has already read, and the reads still in flight.
//
// Held in AsyncLocalStorage for the same reason ancestry is: loadRecipe$ is reached from recipe
// implementations that build their children out of their own model, so there is no parameter to carry
// an operation in. The reader is captured here once, so a later operation configuring its own reader
// cannot change the authority a delayed read of this one is made with.
const storage = new AsyncLocalStorage()

export class RecipeScope {
    #read$
    #readGeoIdFeature$
    #records = new Map()
    #geoIdFeatures = new Map()
    #loads = new Subscription()
    #closed = false

    constructor(read$, {geoIdFeature$} = {}) {
        this.#read$ = read$
        this.#readGeoIdFeature$ = geoIdFeature$
    }

    // The record for this id, read at most once while the operation lasts. Callers arriving while a
    // read is in flight share it, and one of them unsubscribing does not cancel it for the others. A
    // read that fails is not retained: the failure reaches everyone waiting on it, and a later
    // attempt reads again rather than replaying it.
    read$(id) {
        if (this.#closed) {
            return throwError(() => new Error(`Operation ended before recipe was read: ${id}`))
        }
        return this.#records.get(id) ?? this.#retain(this.#records, id, this.#read$)
    }

    // The GeoID service's feature for this GeoID, shared the same way as recipe records and for no longer than
    // the operation: nothing is cached across operations.
    geoIdFeature$(geoId) {
        if (this.#closed) {
            return throwError(() => new Error(`Operation ended before GeoID was resolved: ${geoId}`))
        }
        if (!this.#readGeoIdFeature$) {
            return throwError(() => new Error(`No GeoID reader in this operation; cannot resolve GeoID: ${geoId}`))
        }
        return this.#geoIdFeatures.get(geoId) ?? this.#retain(this.#geoIdFeatures, geoId, this.#readGeoIdFeature$)
    }

    // Ends the operation. Reads still in flight are unsubscribed and what was read released, so a
    // response arriving afterwards reaches nobody.
    close() {
        this.#closed = true
        this.#records.clear()
        this.#geoIdFeatures.clear()
        this.#loads.unsubscribe()
    }

    #retain(retained, key, read$) {
        const value$ = new ReplaySubject(1)
        const shared$ = value$.asObservable()
        retained.set(key, shared$)
        this.#loads.add(read$(key).subscribe({
            next: value => value$.next(value),
            error: error => {
                retained.delete(key)
                value$.error(error)
            },
            complete: () => value$.complete()
        }))
        return shared$
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
