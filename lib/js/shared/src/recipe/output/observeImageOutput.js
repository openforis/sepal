// Runtime adapter between observed evidence and pure output resolution. Descriptions are runtime evidence:
// never written back into recipe objects or persisted band snapshots.
//
// What to observe is discovered by reading the output with nothing held (readImageOutput.js): the observations the
// read says it needs are what to request. A provider therefore has to request every reading it needs before
// testing any of them - one that returns early leaves the rest undiscovered, and they are never requested.
//
// Every observation requested settles before anything is published, each failure on its own, so a failure waits for its
// siblings as a success does. What the others establish is read without the failed ones: a definitive diagnosis outranks
// failed evidence, as it outranks missing evidence (readImageOutput.js), and is published with the failures beside it
// (`failures`, in the order they failed). Any other read with a failure is UNAVAILABLE, carrying the first.
//
// A referenced recipe absent from the session catalogue is UNAVAILABLE, never proof of deletion: the GUI
// catalogue is reference-counted, so absence is routinely "not loaded here, now".
//
// Replacing an observation unsubscribes the one it replaces, and a closed subscriber cannot publish. That is
// the whole staleness mechanism here; no epoch would add behavior an unsubscription does not already produce.

import {BehaviorSubject, catchError, defer, filter, finalize, forkJoin, map, of, take} from 'rxjs'

import {MISSING_SOURCE} from '../source/diagnostic.js'
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

// A read made without the observations that failed. Only a definitive diagnosis stands - not a provider's fault, which
// partial evidence may have caused - and the failed observations it outranks are no part of it.
const besideFailures = (result, failures) =>
    result.status === INVALID && !result.error
        ? {...result, diagnostics: result.diagnostics.filter(({code}) => code !== UNAVAILABLE_DESCRIPTION), failures}
        : state({status: UNAVAILABLE, error: failures[0]})

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
            return {requests: requestsFor(read, graph, declarationFor)}
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
        const failures = []
        pending.subscription = forkJoin(
            requests.map(request => observeBands$(request).pipe(
                map(bands => [referenceKey(request.reference), toObservation(request.reference, bands)]),
                catchError(error => {
                    failures.push(error)
                    return of(null)
                })
            ))
        ).subscribe(observed => {
            settle(pending)
            const result = resolved(graph, Object.fromEntries(observed.filter(Boolean)))
            published.next(failures.length ? besideFailures(result, failures) : result)
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

// The observations a read names, as observeBands$ is asked for them.
const requestsFor = (read, graph, declarationFor) => {
    const recipesById = new Map(graph.recipes.map(recipe => [recipe.id, recipe]))
    return read.needs.observations.map(reference => {
        const recipe = reference.type === RECIPE_REF ? recipesById.get(reference.id) : null
        // What a recipe is asked about is its own declaration's to decide; an asset has no
        // declaration, and is only ever read as the image it stores.
        return recipe
            ? {reference, recipe, observes: declarationFor(recipe)?.observes}
            : {reference}
    })
}

// What can be established of a description refused from the graph alone, for an editor explaining what needs repair:
// one pass requesting every observation the refusal still names, each failing on its own, then the read with those that
// succeeded - its definitive diagnoses, the observations that failed (`failures`), and how many succeeded (`observed`).
// Nothing it answers changes the refusal, nothing failed or missing is a diagnosis, and a graph whose read is not refused
// is explained by nothing. Never observes again for what those observations reveal.
export const explainImageOutput$ = ({graph, observeBands$, declarationFor}) => defer(() => {
    const read = readImageOutput({graph, declarationFor})
    if (read.status !== INVALID) {
        return of({diagnostics: [], failures: [], observed: 0})
    }
    const requests = requestsFor(read, graph, declarationFor)
    if (!requests.length) {
        return of({diagnostics: definitive(read.diagnostics), failures: [], observed: 0})
    }
    const failures = []
    return forkJoin(requests.map(request => observeBands$(request).pipe(
        map(bands => [referenceKey(request.reference), toObservation(request.reference, bands)]),
        catchError(error => {
            failures.push(error)
            return of(null)
        })
    ))).pipe(
        map(observed => {
            const observations = Object.fromEntries(observed.filter(Boolean))
            const explained = readImageOutput({graph, declarationFor, observationFor: reference => observations[referenceKey(reference)]})
            return {diagnostics: definitive(explained.diagnostics), failures, observed: requests.length - failures.length}
        })
    )
})

const definitive = diagnostics =>
    diagnostics.filter(({code}) => code !== UNAVAILABLE_DESCRIPTION && code !== MISSING_SOURCE)

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
