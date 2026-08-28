// Runtime adapter between observed evidence and pure output resolution.
//
// Earth Engine observes band NAMES. It does not observe export pyramiding policies: the legacy asset record
// the API returns carries only id, crs, dimensions, crs_transform and data_type per band. Policies therefore
// come from output declarations and from nowhere else - not from a recipe type name, not from a band name,
// not from the fact that a source happens to be an asset. An asset has no declaration, so its bands arrive
// without policies. That is unresolved evidence, not a malformed asset: the observer reports UNAVAILABLE
// with the exact incomplete-policy diagnosis and never supplies a policy on the asset's behalf.
//
// The observer owns identity, in-flight deduplication and teardown. It does not own resolution, and it does
// not own recipes: descriptions are runtime evidence, never written back into recipe objects or persisted
// band snapshots.
//
// A referenced recipe absent from the session catalogue is UNAVAILABLE, never proof of deletion. The GUI
// catalogue is reference-counted and drops an entry when the last component using it unmounts, so absence is
// routinely "not loaded here, now".
//
// Which references need observing is discovered by RUNNING THE RESOLVER, with an observationFor that records
// what it is asked for and answers nothing. There is deliberately no second traversal: a copy would have to
// re-derive one-input role selection, n-ary edge order and diamond memoization, and would drift from the
// resolver the moment either changed. It also asks for exactly the output-relevant references and no others.
//
// Replacing an observation unsubscribes the one it replaces, and a closed subscriber cannot publish. That is
// the whole staleness mechanism at this boundary; no epoch is carried, because none would have behavior an
// unsubscription does not already produce.

import {BehaviorSubject, forkJoin, map} from 'rxjs'

import {MISSING_SOURCE} from '../source/diagnostic.js'
import {ASSET, RECIPE_REF} from '../source/reference.js'
import {INCOMPLETE_IMAGE_OUTPUT, UNAVAILABLE_DESCRIPTION} from './diagnostic.js'
import {resolveImageOutput} from './resolveImageOutput.js'

export const PENDING = 'PENDING'
export const LOADING = 'LOADING'
export const READY = 'READY'
export const UNAVAILABLE = 'UNAVAILABLE'
export const INVALID = 'INVALID'

export const referenceKey = ({type, id}) => `${type}:${id}`

const ABSENT_EVIDENCE = new Set([MISSING_SOURCE, UNAVAILABLE_DESCRIPTION])

// Evidence that is missing rather than wrong. An INCOMPLETE asset output belongs here because Earth Engine
// exposes no export policy for an asset, so an absent one is unknown. Only that code qualifies: an asset
// whose bands are malformed or duplicated is wrong, not unknown, and stays definitive.
const isUnresolved = ({code, reference}) =>
    ABSENT_EVIDENCE.has(code) || (code === INCOMPLETE_IMAGE_OUTPUT && reference?.type === ASSET)

const state = ({status, description = null, diagnostics = [], error = null}) =>
    ({status, description, diagnostics, error})

const classify = diagnostics => state({
    status: diagnostics.every(isUnresolved) ? UNAVAILABLE : INVALID,
    diagnostics
})

// A recipe's observation is raw evidence for its own declaration to interpret. An asset has no declaration,
// so its observation is already a candidate - named bands, and no policy anyone is entitled to supply.
const toObservation = (reference, bandNames) => reference.type === ASSET
    ? {bands: bandNames.map(name => ({name})), evidence: []}
    : {bandNames}

export const createImageOutputObserver = ({observeBandNames$, declarationFor}) => {
    const published = new BehaviorSubject(state({status: PENDING}))
    let inFlight = null

    // Held as a container assigned BEFORE subscribing. A synchronous observation completes inside
    // subscribe(), so a subscriber reacting to READY can re-enter observe() and start the next request
    // before the outer assignment would have run; assigning afterwards would overwrite that nested
    // request with an already-completed one, leaving it untearable and free to publish later.
    const teardown = () => {
        const request = inFlight
        inFlight = null
        request?.subscription?.unsubscribe()
    }

    const settle = request => {
        if (inFlight === request) {
            inFlight = null
        }
    }

    const resolve = (graph, observations) => resolveImageOutput({
        graph,
        declarationFor,
        observationFor: reference => observations[referenceKey(reference)]
    })

    const discover = graph => {
        const recipesById = new Map(graph.recipes.map(recipe => [recipe.id, recipe]))
        const requests = new Map()
        const {diagnostics} = resolveImageOutput({
            graph,
            declarationFor,
            observationFor: reference => {
                const key = referenceKey(reference)
                if (!requests.has(key)) {
                    requests.set(key, reference.type === RECIPE_REF
                        ? {reference, recipe: recipesById.get(reference.id)}
                        : {reference})
                }
                return undefined
            }
        })
        return {
            requests: [...requests.values()],
            // Every discovered reference is reported unavailable because discovery answered nothing. Those
            // are the question, not an answer; anything else is a fault no observation can repair.
            diagnostics: diagnostics.filter(({code}) => code !== UNAVAILABLE_DESCRIPTION)
        }
    }

    const observe = graph => {
        teardown()
        if (graph.diagnostics.length) {
            return published.next(classify(graph.diagnostics))
        }
        const {requests, diagnostics} = discover(graph)
        if (diagnostics.length) {
            return published.next(classify(diagnostics))
        }
        if (!requests.length) {
            return published.next(describe(resolve(graph, {})))
        }
        const pending = {subscription: null}
        inFlight = pending
        published.next(state({status: LOADING}))
        // A subscriber may legitimately switch graphs the moment loading starts. If it did, it owns
        // inFlight now, and this observation is superseded before it began: starting it would request
        // references nobody is waiting for and leave a subscription the replacement cannot tear down.
        if (inFlight !== pending) {
            return
        }
        pending.subscription = forkJoin(
            requests.map(request => observeBandNames$(request).pipe(
                map(bandNames => [referenceKey(request.reference), toObservation(request.reference, bandNames)])
            ))
        ).subscribe({
            next: observed => {
                settle(pending)
                published.next(describe(resolve(graph, Object.fromEntries(observed))))
            },
            error: error => {
                settle(pending)
                published.next(state({status: UNAVAILABLE, error}))
            }
        })
    }

    const describe = ({description, diagnostics}) => description
        ? state({status: READY, description})
        : classify(diagnostics)

    return {
        state$: published.asObservable(),
        observe,
        cancel: () => {
            teardown()
            published.next(state({status: PENDING}))
        }
    }
}
