// Runtime adapter between observed evidence and pure output resolution. Descriptions are runtime evidence:
// never written back into recipe objects or persisted band snapshots.
//
// What to observe is discovered by reading the output with nothing held (readImageOutput.js): the observations the
// read says it needs are what to request. A provider therefore has to request every reading it needs before
// testing any of them - one that returns early leaves the rest undiscovered, and they are never requested.
//
// A referenced recipe absent from the session catalogue is UNAVAILABLE, never proof of deletion: the GUI
// catalogue is reference-counted, so absence is routinely "not loaded here, now".
//
// Replacing an observation unsubscribes the one it replaces, and a closed subscriber cannot publish. That is
// the whole staleness mechanism here; no epoch would add behavior an unsubscription does not already produce.

import {BehaviorSubject, defer, filter, finalize, forkJoin, map, take} from 'rxjs'

import {ASSET, RECIPE_REF} from '../source/reference.js'
import {UNAVAILABLE_DESCRIPTION} from './diagnostic.js'
import {withPhysicalPolicy} from './physicalBands.js'
import {INVALID, NEEDS_EVIDENCE, readImageOutput, READY, referenceKey} from './readImageOutput.js'

export {INVALID, READY, referenceKey} from './readImageOutput.js'

export const PENDING = 'PENDING'
export const LOADING = 'LOADING'
export const UNAVAILABLE = 'UNAVAILABLE'

const state = ({status, description = null, diagnostics = [], error = null}) =>
    ({status, description, diagnostics, error})

// The read decides. The observer adds one fact the read cannot know: its graph is a completed closure, so a recipe
// the read still needs is one that could not be had. Observations it names are the only evidence left to request.
const settled = ({status, description, diagnostics}) => {
    switch (status) {
        case READY:
            return state({status: READY, description})
        case INVALID:
            return state({status: INVALID, diagnostics})
        default:
            return state({status: UNAVAILABLE, diagnostics})
    }
}

const physicalBand = ({name, arrayDimensions, encoding}) => ({
    name,
    ...(arrayDimensions !== undefined && {dataType: {arrayDimensions}}),
    ...(encoding !== undefined && {encoding})
})

// Recipe declarations own their policies. An asset has none, so only verified array dimensionality supplies the
// physical sample default; scalar and unknown policies stay absent for destination-time validation.
const toObservation = (reference, observedBands) => reference.type === ASSET
    ? {bands: observedBands.map(observed => withPhysicalPolicy(physicalBand(observed))), evidence: []}
    : {bands: observedBands.map(physicalBand)}

export const createImageOutputObserver = ({observeBands$, declarationFor}) => {
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

    // A provider fault must be published, never allowed to escape: thrown out of a subscription notification it
    // reaches RxJS on a timeout of its own, where nothing can publish and the request stays LOADING for good.
    const faulted = error => state({status: INVALID, error})

    const resolved = (graph, observations) => {
        try {
            return settled(readImageOutput({
                graph,
                declarationFor,
                observationFor: reference => observations[referenceKey(reference)]
            }))
        } catch (error) {
            return faulted(error)
        }
    }

    // Discovery is a read with nothing held. Only a read that needs observations and no record goes on to request
    // them; any other settles here. An observation it named but did not answer is the question, not a diagnosis,
    // so it is not reported as one.
    const discover = graph => {
        const read = readImageOutput({graph, declarationFor})
        if (read.status === NEEDS_EVIDENCE && !read.needs.records.length) {
            const recipesById = new Map(graph.recipes.map(recipe => [recipe.id, recipe]))
            return {
                requests: read.needs.observations.map(reference => {
                    const recipe = reference.type === RECIPE_REF ? recipesById.get(reference.id) : null
                    // What a recipe is asked about is its own declaration's to decide; an asset has no
                    // declaration, and is only ever read as the image it stores.
                    return recipe
                        ? {reference, recipe, observes: declarationFor(recipe)?.observes}
                        : {reference}
                })
            }
        }
        return {
            settledState: settled({
                ...read,
                diagnostics: read.diagnostics.filter(({code}) => code !== UNAVAILABLE_DESCRIPTION)
            })
        }
    }

    // Only what the description reads can fail it: a structural diagnosis elsewhere in the graph is the
    // complete graph's to report (source/dependencyValidity.js), not this observer's.
    const observe = graph => {
        teardown()
        let discovered
        try {
            discovered = discover(graph)
        } catch (fault) {
            return published.next(faulted(fault))
        }
        const {requests, settledState} = discovered
        if (settledState) {
            return published.next(settledState)
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
            requests.map(request => observeBands$(request).pipe(
                map(bands => [referenceKey(request.reference), toObservation(request.reference, bands)])
            ))
        ).subscribe({
            next: observed => {
                settle(pending)
                published.next(resolved(graph, Object.fromEntries(observed)))
            },
            error: error => {
                settle(pending)
                published.next(state({status: UNAVAILABLE, error}))
            }
        })
    }

    return {
        state$: published.asObservable(),
        observe,
        cancel: () => {
            teardown()
            published.next(state({status: PENDING}))
        }
    }
}

const SETTLED = new Set([READY, UNAVAILABLE, INVALID])

// One description of one graph, for a consumer that asks once rather than watching. Its own observer per
// subscription, released when it settles, when the subscriber leaves, or when either fails. Observation starts
// before the state is subscribed to: the observer publishes through a BehaviorSubject, so a graph it resolves
// synchronously is already settled when the subscriber arrives.
export const settledImageOutput$ = ({graph, observeBands$, declarationFor}) => defer(() => {
    const observer = createImageOutputObserver({observeBands$, declarationFor})
    const settled$ = observer.state$.pipe(
        filter(({status}) => SETTLED.has(status)),
        take(1),
        finalize(() => observer.cancel())
    )
    observer.observe(graph)
    return settled$
})
