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
// Given `readinessFor`, whether running the output is possible settles the same way (`readiness`,
// output/readiness.js): what it needs is requested with what the description needs. Settled, what it still needs could
// not be had, so it is UNAVAILABLE - unless something was found, which stays NOT_READY with every finding, the failures
// beside it. A failure of evidence only readiness needed leaves the description as it was read. A finding settles
// readiness as a definitive diagnosis settles the description: nothing more is requested for it, though explaining it
// does request the rest (explainImageOutput$).
//
// Replacing an observation unsubscribes the one it replaces, and a closed subscriber cannot publish. That is
// the whole staleness mechanism here; no epoch would add behavior an unsubscription does not already produce.

import {BehaviorSubject, catchError, defer, filter, finalize, forkJoin, map, of, take} from 'rxjs'

import {MISSING_SOURCE} from '../source/diagnostic.js'
import {ASSET, RECIPE_REF} from '../source/reference.js'
import {UNAVAILABLE_DESCRIPTION} from './diagnostic.js'
import {withPhysicalPolicy} from './physicalBands.js'
import {INVALID, NEEDS_EVIDENCE, readImageOutput, readReadiness, READY, referenceKey} from './readImageOutput.js'
import {NOT_READY} from './readiness.js'

export {INVALID, READY, referenceKey} from './readImageOutput.js'

export const PENDING = 'PENDING'
export const LOADING = 'LOADING'
export const UNAVAILABLE = 'UNAVAILABLE'

const state = ({status, description = null, diagnostics = [], error = null, readiness}) =>
    ({status, description, diagnostics, error, ...(readiness && {readiness})})

// The read decides. The observer adds one fact the read cannot know: its graph is a completed closure, so a recipe
// the read still needs is one that could not be had. Observations it names are the only evidence left to request.
const settled = ({status, description, diagnostics, readiness}) => {
    const ready = settledReadiness(readiness)
    switch (status) {
        case READY:
            return state({status: READY, description, readiness: ready})
        case INVALID:
            return state({status: INVALID, diagnostics, readiness: ready})
        default:
            return state({status: UNAVAILABLE, diagnostics, readiness: ready})
    }
}

const settledReadiness = readiness => readiness && readiness.status === NEEDS_EVIDENCE
    ? {...readiness, status: UNAVAILABLE}
    : readiness

// A read made without the observations that failed. Only a definitive diagnosis stands - not a provider's fault, which
// partial evidence may have caused - and the failed observations it outranks are no part of it. A description read in
// full needed none of them: they were readiness's alone.
const besideFailures = (result, failures) => {
    const readiness = result.readiness && (result.readiness.status === NOT_READY
        ? {...result.readiness, failures}
        : {...result.readiness, status: UNAVAILABLE, failures})
    if (result.status === READY) {
        return {...result, ...(readiness && {readiness})}
    }
    return result.status === INVALID && !result.error
        ? {...result, diagnostics: result.diagnostics.filter(({code}) => code !== UNAVAILABLE_DESCRIPTION), failures, ...(readiness && {readiness})}
        : state({status: UNAVAILABLE, error: failures[0], readiness})
}

// Whether a read waits for observations alone - for its description or for whether it can run.
const awaitsObservations = read =>
    (read.status === NEEDS_EVIDENCE || read.readiness?.status === NEEDS_EVIDENCE)
    && !read.needs.records.length && read.needs.observations.length > 0

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

// `read` is what each pass reads: the image output, unless a caller asks for something else read the same way.
export const createImageOutputObserver = ({observeBands$, declarationFor, readinessFor, read = readImageOutput}) => {
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
            return settled(read({
                graph,
                declarationFor,
                readinessFor,
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
        const discovered = read({graph, declarationFor, readinessFor})
        if (awaitsObservations(discovered)) {
            return {requests: requestsFor(discovered, graph, declarationFor)}
        }
        return {
            settledState: settled({
                ...discovered,
                diagnostics: discovered.diagnostics.filter(({code}) => code !== UNAVAILABLE_DESCRIPTION)
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
//
// Given `readinessFor`, a refusal to run is explained the same way: what readiness still needs is requested with what
// the description's refusal names, and the findings the read then establishes are answered beside its diagnoses
// (`findings`).
export const explainImageOutput$ = ({graph, observeBands$, declarationFor, readinessFor}) => defer(() => {
    const read = readImageOutput({graph, declarationFor, readinessFor})
    if (!isRefused(read)) {
        return of({diagnostics: [], findings: [], failures: [], observed: 0})
    }
    const requests = requestsFor(read, graph, declarationFor)
    if (!requests.length) {
        return of(explanation(read, [], 0))
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
            const explained = readImageOutput({
                graph, declarationFor, readinessFor, observationFor: reference => observations[referenceKey(reference)]
            })
            return explanation(explained, failures, requests.length - failures.length)
        })
    )
})

const isRefused = read =>
    read.status === INVALID || read.readiness?.status === NOT_READY

const explanation = (read, failures, observed) => ({
    diagnostics: read.status === INVALID ? definitive(read.diagnostics) : [],
    findings: read.readiness?.findings || [],
    failures,
    observed
})

const definitive = diagnostics =>
    diagnostics.filter(({code}) => code !== UNAVAILABLE_DESCRIPTION && code !== MISSING_SOURCE)

const SETTLED = new Set([READY, UNAVAILABLE, INVALID])

// One description of one graph, for a consumer that asks once rather than watching. Its own observer per
// subscription, released when it settles, when the subscriber leaves, or when either fails. Observation starts
// before the state is subscribed to: the observer publishes through a BehaviorSubject, so a graph it resolves
// synchronously is already settled when the subscriber arrives.
export const settledImageOutput$ = ({graph, observeBands$, declarationFor, readinessFor}) =>
    settled$({graph, observeBands$, declarationFor, readinessFor})

// Whether `operation` over the root can run, settled the same way but with nothing of the root described
// (readReadiness): its readiness, a failed observation beside it. A provider fault fails it.
export const settledReadiness$ = ({graph, operation, observeBands$, declarationFor, readinessFor}) =>
    settled$({
        graph, observeBands$, declarationFor, readinessFor,
        read: args => readReadiness({...args, operation})
    }).pipe(
        map(({readiness, error}) => {
            if (!readiness) {
                throw error
            }
            return readiness
        })
    )

const settled$ = ({graph, observeBands$, declarationFor, readinessFor, read}) => defer(() => {
    const observer = createImageOutputObserver({observeBands$, declarationFor, readinessFor, read})
    const settledState$ = observer.state$.pipe(
        filter(({status}) => SETTLED.has(status)),
        take(1),
        finalize(() => observer.cancel())
    )
    observer.observe(graph)
    return settledState$
})
