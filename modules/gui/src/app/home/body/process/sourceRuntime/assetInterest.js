import _ from 'lodash'
import {NEVER} from 'rxjs'

// Which assets each watched output question reads, claimed for as long as it is watched (assetRefresh.js).
//
// A question reads the assets its session graph reaches whether or not its answer needs loading - an output described
// from configuration alone still draws pixels from them - and every asset its work's closure read, records loaded only
// for that work included. What it reads is recomputed when the session or its work changes; assets it reads anew are
// claimed before those it no longer reads are released, so an asset both read is never let go in between.

export class AssetInterest {
    #claim
    #assetsOf
    #sessionChanges$
    #watched = new Set()
    #listening = null

    // claim(ids)          → release, claiming the assets for as long as they are read
    // assetsOf(question)  → the ids of every asset the question reads now
    // sessionChanges$     notifies after every session change
    constructor({claim, assetsOf, sessionChanges$ = NEVER}) {
        this.#claim = claim
        this.#assetsOf = assetsOf
        this.#sessionChanges$ = sessionChanges$
    }

    // Returns {update, release}: update after the question's work changes, release once it is no longer watched.
    watch(question) {
        const watched = {question, ids: [], release: () => {}}
        this.#watched.add(watched)
        this.#listen()
        this.#update(watched)
        return {
            update: () => this.#watched.has(watched) && this.#update(watched),
            release: () => {
                if (this.#watched.delete(watched)) {
                    watched.release()
                    if (!this.#watched.size) {
                        this.#stopListening()
                    }
                }
            }
        }
    }

    close() {
        this.#stopListening()
        this.#watched.forEach(watched => watched.release())
        this.#watched.clear()
    }

    #update(watched) {
        const ids = _.uniq(this.#assetsOf(watched.question)).sort()
        if (_.isEqual(ids, watched.ids)) {
            return
        }
        const previous = watched.release
        watched.ids = ids
        watched.release = this.#claim(ids)
        previous()
    }

    #listen() {
        if (!this.#listening) {
            this.#listening = this.#sessionChanges$.subscribe(() => [...this.#watched].forEach(watched => this.#update(watched)))
        }
    }

    #stopListening() {
        this.#listening?.unsubscribe()
        this.#listening = null
    }
}
