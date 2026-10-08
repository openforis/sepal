import {config, map, Observable, of, Subject} from 'rxjs'

import {createImageOutputObserver, referenceKey, settledImageOutput$} from '#sepal/recipe/output/observeImageOutput'
import {AVAILABLE_BANDS, imageOutputProvider, NO_IMAGE_OUTPUT, preservingProvider} from '#sepal/recipe/output/provider'

// Statuses and diagnostic codes are asserted as literals: importing them would let production and these
// tests rename together and stay green, and this suite is where their external meaning is defined.

const recipeReference = id => ({type: 'RECIPE_REF', id})
const assetReference = id => ({type: 'ASSET', id})
const band = (name, pyramidingPolicy, dataType = {arrayDimensions: 0}) => ({
    name,
    dataType,
    ...(pyramidingPolicy !== undefined && {pyramidingPolicy})
})
const edge = (sourceRecipeId, role, reference, diagnostic) =>
    ({sourceRecipeId, role, reference, path: ['model', role], ...(diagnostic && {diagnostic})})
const node = (id, type) => ({id, type})
const graph = ({recipes, edges = [], diagnostics = []}) => ({recipes, edges, diagnostics})

const state = ({status, description = null, diagnostics = [], error = null}) =>
    ({status, description, diagnostics, error})

const described = (id, bands, evidence = []) => ({
    executionReference: recipeReference(id),
    output: {kind: 'IMAGE', bands},
    evidence
})

// Synthetic types only. Nothing is registered, and no real recipe declaration is activated.
const SAMPLED = 'SYNTHETIC_SAMPLED'
const CLASS_BASED = 'SYNTHETIC_CLASS_BASED'
const PASS_THROUGH = 'SYNTHETIC_PASS_THROUGH'
const COMBINE = 'SYNTHETIC_COMBINE'
const DUPLICATING = 'SYNTHETIC_DUPLICATING'
const CONFIGURED = 'SYNTHETIC_CONFIGURED'
const CATALOGUED = 'SYNTHETIC_CATALOGUED'
const NON_IMAGE = 'SYNTHETIC_NON_IMAGE'
const INTERPRETING_FAULT = 'SYNTHETIC_INTERPRETING_FAULT'
const CONFIGURING_FAULT = 'SYNTHETIC_CONFIGURING_FAULT'

const PROVIDER_FAULT = new Error('the provider cannot interpret this')

const observedBands = observation => observation.bands
    || observation.bandNames.map(name => ({name}))

const declaredBand = (observed, pyramidingPolicy) =>
    band(observed.name, pyramidingPolicy, observed.dataType)

const fromObservation = toBands => imageOutputProvider({
    describe: ({observation}) => {
        const observed = observation()
        return observed && {bands: toBands(observedBands(observed)), evidence: []}
    }
})

const declarations = {
    // States that its recipes produce no image.
    [NON_IMAGE]: NO_IMAGE_OUTPUT,
    // The provider owns the policy. It maps observed names in observed order and states each policy;
    // nothing downstream may supply one on its behalf.
    [SAMPLED]: fromObservation(bands => bands.map(observed => declaredBand(observed, 'sample'))),
    [CLASS_BASED]: fromObservation(bands => bands.map(observed =>
        declaredBand(observed, observed.name === 'class' ? 'mode' : 'mean')
    )),
    [DUPLICATING]: fromObservation(bands => bands.map(() => band('same', 'mean'))),
    // Asks what it can be asked for rather than what it builds unrequested, and supplies the facts itself.
    [CATALOGUED]: imageOutputProvider({
        observes: AVAILABLE_BANDS,
        describe: ({observation}) => {
            const observed = observation()
            return observed && {bands: observedBands(observed).map(({name}) => band(name, 'sample')), evidence: []}
        }
    }),
    [CONFIGURED]: imageOutputProvider({describe: ({recipe}) => ({bands: recipe.configuredBands, evidence: []})}),
    [PASS_THROUGH]: preservingProvider({role: 'image'}),
    [COMBINE]: imageOutputProvider({
        describe: ({inputs}) => {
            const all = inputs()
            return all && {bands: all.flatMap(({description}) => description.output.bands), evidence: []}
        }
    }),
    // Resolves while its observation is unanswered, as discovery leaves it, and faults on the answer itself.
    [INTERPRETING_FAULT]: imageOutputProvider({
        describe: ({observation}) => {
            if (!observation()) {
                return null
            }
            throw PROVIDER_FAULT
        }
    }),
    [CONFIGURING_FAULT]: imageOutputProvider({describe: () => {
        throw PROVIDER_FAULT
    }})
}

// The acquisition a runtime supplies, recording what was asked for and what was torn down. A reference named
// in `synchronous` answers on subscription; every other one waits for `emit`.
const acquisition = ({synchronous = {}} = {}) => {
    const requests = []
    const subscribed = []
    const torndown = []
    const subjectsByKey = {}
    const subjectOf = reference => {
        const key = referenceKey(reference)
        if (!subjectsByKey[key]) {
            subjectsByKey[key] = new Subject()
        }
        return subjectsByKey[key]
    }
    const observe$ = (request, normalize) => {
        const key = referenceKey(request.reference)
        requests.push(request)
        return new Observable(subscriber => {
            subscribed.push(key)
            const source = synchronous[key] ? of(synchronous[key]) : subjectOf(request.reference)
            const inner = source.pipe(
                map(bands => bands.map(normalize))
            ).subscribe(subscriber)
            return () => {
                torndown.push(key)
                inner.unsubscribe()
            }
        })
    }
    return {
        requests, subscribed, torndown, subjectsByKey, subjectOf,
        // A name alone stands for a scalar, as Earth Engine reports every band's dimensionality.
        observeBands$: request => observe$(request, value => typeof value === 'string' ? {name: value, arrayDimensions: 0} : value),
        observeBandNames$: request => observe$(request, value => typeof value === 'string' ? value : value.name),
        declarationFor: ({type}) => declarations[type],
        emit: (reference, bandNames) => {
            const subject = subjectOf(reference)
            subject.next(bandNames)
            subject.complete()
        }
    }
}

const observerOver = ({synchronous = {}} = {}) => {
    const acquired = acquisition({synchronous})
    const observer = createImageOutputObserver(acquired)
    const states = []
    let terminated = null
    observer.state$.subscribe({
        next: published => states.push(published),
        error: error => terminated = {error},
        complete: () => terminated = {complete: true}
    })
    return {...acquired, observer, states, terminated: () => terminated}
}

// The one-shot over the same acquisition: what a consumer asking for one description subscribes to.
const settledOver = ({synchronous = {}} = {}) => {
    const acquired = acquisition({synchronous})
    return {
        ...acquired,
        settled$: graph => settledImageOutput$({graph, ...acquired})
    }
}

const collect = observable$ => {
    const settled = []
    let completed = false
    const subscription = observable$.subscribe({
        next: value => settled.push(value),
        complete: () => completed = true
    })
    return {settled, subscription, completed: () => completed, only: () => settled[settled.length - 1]}
}

const latest = states => states[states.length - 1]

// RxJS reports a throw from a subscription handler outside the subscription that caused it, on its own
// timeout, where nothing can publish. Captured and flushed so a fault the observer failed to settle cannot
// pass as one it settled.
const unhandled = []

let reportUnhandled = null

const unhandledErrors = async () => {
    await new Promise(resolve => setTimeout(resolve))
    return unhandled
}

beforeEach(() => {
    unhandled.length = 0
    reportUnhandled = config.onUnhandledError
    config.onUnhandledError = error => unhandled.push(error)
})

// Drained while the capture is still installed, so a report queued by one test cannot arrive during the next,
// and asserted for every test: one that never asks would otherwise swallow a throw it did not expect. The
// previous handler is restored whatever the outcome, so this suite leaves the global config as it found it.
afterEach(async () => {
    try {
        expect(await unhandledErrors()).toEqual([])
    } finally {
        config.onUnhandledError = reportUnhandled
    }
})

const chain = () => graph({
    recipes: [node('root', PASS_THROUGH), node('inner', CLASS_BASED)],
    edges: [edge('root', 'image', recipeReference('inner'))]
})

const twoBranches = () => graph({
    recipes: [node('root', COMBINE), node('a', SAMPLED), node('b', CLASS_BASED)],
    edges: [
        edge('root', 'left', recipeReference('a')),
        edge('root', 'right', recipeReference('b'))
    ]
})

describe('observation boundary', () => {
    it('accepts the normalized observeBands$ contract without a legacy callback', () => {
        const requests = []
        const observer = createImageOutputObserver({
            observeBands$: request => {
                requests.push(request)
                return of([{name: 'class'}])
            },
            declarationFor: ({type}) => declarations[type]
        })

        observer.observe(graph({recipes: [node('root', CLASS_BASED)]}))

        expect(requests).toEqual([{
            reference: recipeReference('root'),
            recipe: node('root', CLASS_BASED),
            observes: 'RUNNING_IMAGE'
        }])
    })

    // A provider decides which question about its own image it is answering, and the request carries that
    // decision to whichever runtime acquires it.
    it('carries the observation its declaration asks for', () => {
        const {observer, requests} = observerOver()

        observer.observe(graph({recipes: [node('root', CATALOGUED)]}))

        expect(requests).toEqual([{
            reference: recipeReference('root'),
            recipe: node('root', CATALOGUED),
            observes: 'AVAILABLE_BANDS'
        }])
    })

    it('supplies the exact graph recipe record beside a recipe reference', () => {
        const inner = node('inner', CLASS_BASED)
        const {observer, requests} = observerOver()
        observer.observe(graph({
            recipes: [node('root', PASS_THROUGH), inner],
            edges: [edge('root', 'image', recipeReference('inner'))]
        }))

        expect(requests).toEqual([{reference: recipeReference('inner'), recipe: inner, observes: 'RUNNING_IMAGE'}])
    })

    it('supplies an asset reference without fabricating a recipe record', () => {
        const leaf = assetReference('users/x/leaf')
        const {observer, requests} = observerOver()
        observer.observe(graph({
            recipes: [node('root', PASS_THROUGH)],
            edges: [edge('root', 'image', leaf)]
        }))

        expect(requests).toEqual([{reference: leaf}])
        expect('recipe' in requests[0]).toBe(false)
    })
})

describe('lifecycle', () => {
    it('starts pending on a read-only state$, with no observation requested', () => {
        const {observer, states, requests} = observerOver()

        expect(observer.state$.next).toBeUndefined()
        expect(latest(states)).toEqual(state({status: 'PENDING'}))
        expect(requests).toEqual([])
    })

    it('is loading while the observations it requested are in flight', () => {
        const {observer, states, requests} = observerOver()
        observer.observe(twoBranches())

        expect(latest(states)).toEqual(state({status: 'LOADING'}))
        expect(requests.map(({reference}) => reference))
            .toEqual([recipeReference('a'), recipeReference('b')])
    })

    it('is ready once every observation resolves', () => {
        const {observer, states, emit} = observerOver()
        observer.observe(chain())
        emit(recipeReference('inner'), ['class', 'probability'])

        expect(latest(states)).toEqual(state({
            status: 'READY',
            description: described('root', [band('class', 'mode'), band('probability', 'mean')])
        }))
    })

    it('returns to pending on cancel, tearing down what was in flight', () => {
        const {observer, states, torndown} = observerOver()
        observer.observe(twoBranches())
        expect(torndown).toEqual([])

        observer.cancel()
        expect([...torndown].sort()).toEqual(['RECIPE_REF:a', 'RECIPE_REF:b'])
        expect(latest(states)).toEqual(state({status: 'PENDING'}))
    })

    it('observes again after a cancel', () => {
        const {observer, states, emit} = observerOver()
        observer.observe(twoBranches())
        observer.cancel()

        observer.observe(chain())
        emit(recipeReference('inner'), ['class'])
        expect(latest(states)).toEqual(state({
            status: 'READY',
            description: described('root', [band('class', 'mode')])
        }))
    })
})

describe('a description from configuration', () => {
    it('is ready at once through a wrapper, with no observation requested', () => {
        const {observer, requests, states} = observerOver()
        const configured = [band('red', undefined, {arrayDimensions: 0})]

        observer.observe(graph({
            recipes: [node('root', PASS_THROUGH), {id: 'inner', type: CONFIGURED, configuredBands: configured}],
            edges: [edge('root', 'image', recipeReference('inner'))]
        }))

        expect(requests).toEqual([])
        expect(latest(states)).toEqual(state({status: 'READY', description: described('root', configured)}))
    })
})

describe('observation failure', () => {
    it('reports the failure as unavailable, retaining the error unchanged', () => {
        const failure = new Error('earth engine unavailable')
        const {observer, states, subjectOf} = observerOver()
        observer.observe(chain())
        subjectOf(recipeReference('inner')).error(failure)

        const published = latest(states)
        expect(published).toEqual(state({status: 'UNAVAILABLE', error: failure}))
        expect(published.error).toBe(failure)
    })

    it('settles once its siblings have, keeping what failed first however the rest end', () => {
        const failure = new Error('failed')
        const {observer, states, torndown, subjectOf, emit} = observerOver()
        observer.observe(twoBranches())

        subjectOf(recipeReference('a')).error(failure)
        expect(latest(states)).toEqual(state({status: 'LOADING'}))
        expect(torndown).not.toContain('RECIPE_REF:b')

        emit(recipeReference('b'), ['class'])
        expect(latest(states)).toEqual(state({status: 'UNAVAILABLE', error: failure}))
        expect(latest(states).error).toBe(failure)
    })

    it('carries the first failure when several observations fail', () => {
        const first = new Error('first')
        const {observer, states, subjectOf} = observerOver()
        observer.observe(twoBranches())

        subjectOf(recipeReference('b')).error(first)
        subjectOf(recipeReference('a')).error(new Error('second'))

        expect(latest(states).error).toBe(first)
    })

    it('never terminates the observer, leaving the next request free to resolve', () => {
        const {observer, states, terminated, subjectOf, emit} = observerOver()
        observer.observe(chain())
        subjectOf(recipeReference('inner')).error(new Error('failed'))
        expect(terminated()).toBe(null)

        observer.observe(twoBranches())
        emit(recipeReference('a'), ['VV'])
        emit(recipeReference('b'), ['class'])
        expect(latest(states)).toEqual(state({
            status: 'READY',
            description: described('root', [band('VV', 'sample'), band('class', 'mode')])
        }))
    })

    it('returns to pending on cancel while it waits for its siblings, tearing them down', () => {
        const {observer, states, torndown, subjectOf} = observerOver()
        observer.observe(twoBranches())
        subjectOf(recipeReference('a')).error(new Error('failed'))

        observer.cancel()

        expect(torndown).toContain('RECIPE_REF:b')
        expect(latest(states)).toEqual(state({status: 'PENDING'}))
    })

    it('cannot be published once another graph replaces it while it waits', () => {
        const {observer, states, torndown, subjectOf, emit} = observerOver()
        const sibling = subjectOf(recipeReference('b'))
        observer.observe(twoBranches())
        subjectOf(recipeReference('a')).error(new Error('failed'))

        observer.observe(chain())
        expect(torndown).toContain('RECIPE_REF:b')
        emit(recipeReference('inner'), ['class'])
        const current = latest(states)

        sibling.next(['class'])
        sibling.complete()
        expect(current).toEqual(state({status: 'READY', description: described('root', [band('class', 'mode')])}))
        expect(latest(states)).toBe(current)
    })
})

// What the observations that arrived establish is read without those that failed. A definitive diagnosis outranks failed
// evidence as it outranks missing evidence; the failures stay beside it for whoever acts on them.
describe('a definitive diagnosis beside a failed observation', () => {
    const malformed = assetReference('users/x/malformed')
    const failing = assetReference('users/x/failing')
    const combining = () => graph({
        recipes: [node('root', COMBINE)],
        edges: [edge('root', 'left', malformed), edge('root', 'right', failing)]
    })
    const duplicate = {code: 'DUPLICATE_BAND_NAME', path: ['bands', 1, 'name'], recipePath: ['root'], reference: malformed}

    it('settles as invalid on the diagnosis, with the failure beside it', () => {
        const failure = new Error('earth engine unavailable')
        const {observer, states, subjectOf, emit} = observerOver()
        observer.observe(combining())

        subjectOf(failing).error(failure)
        emit(malformed, ['B1', 'B1'])

        const published = latest(states)
        expect(published).toEqual({...state({status: 'INVALID', diagnostics: [duplicate]}), failures: [failure]})
        expect(published.failures[0]).toBe(failure)
    })

    it('is not taken from a provider faulting on what arrived, which stays unavailable for the failure', () => {
        const failure = new Error('earth engine unavailable')
        const {observer, states, subjectOf, emit} = observerOver()
        observer.observe(graph({
            recipes: [node('root', COMBINE), node('a', INTERPRETING_FAULT)],
            edges: [edge('root', 'left', recipeReference('a')), edge('root', 'right', failing)]
        }))

        subjectOf(failing).error(failure)
        emit(recipeReference('a'), ['VV'])

        expect(latest(states)).toEqual(state({status: 'UNAVAILABLE', error: failure}))
    })

    it('settles one description and completes', () => {
        const failure = new Error('earth engine unavailable')
        const {settled$, subjectOf, emit} = settledOver()

        const result = collect(settled$(combining()))
        subjectOf(failing).error(failure)
        emit(malformed, ['B1', 'B1'])

        expect(result.only()).toEqual({...state({status: 'INVALID', diagnostics: [duplicate]}), failures: [failure]})
        expect(result.completed()).toBe(true)
    })
})

// A provider is the recipe type's own code. When it throws, the answer is neither absent evidence nor a
// malformed candidate, and nothing an observation could supply would change it - but a consumer is waiting
// for a description, so it must still settle, carrying the cause it settled on.
describe('a faulting provider', () => {
    it('settles as invalid when it throws on the observation it asked for, keeping the cause', async () => {
        const {observer, states, terminated, emit} = observerOver()
        observer.observe(graph({recipes: [node('root', INTERPRETING_FAULT)]}))
        emit(recipeReference('root'), ['VV'])

        const published = latest(states)
        expect(published).toEqual(state({status: 'INVALID', error: PROVIDER_FAULT}))
        expect(published.error).toBe(PROVIDER_FAULT)
        expect(terminated()).toBe(null)
        expect(await unhandledErrors()).toEqual([])
    })

    it('settles as invalid when it throws during discovery, before anything is observed', async () => {
        const {observer, states, requests, terminated} = observerOver()
        observer.observe(graph({
            recipes: [node('root', PASS_THROUGH), node('inner', CONFIGURING_FAULT)],
            edges: [edge('root', 'image', recipeReference('inner'))]
        }))

        const published = latest(states)
        expect(published).toEqual(state({status: 'INVALID', error: PROVIDER_FAULT}))
        expect(published.error).toBe(PROVIDER_FAULT)
        expect(requests).toEqual([])
        expect(terminated()).toBe(null)
        expect(await unhandledErrors()).toEqual([])
    })

    it('leaves the next request free to resolve, and cancel free to return to pending', () => {
        const {observer, states, emit} = observerOver()
        observer.observe(graph({recipes: [node('root', INTERPRETING_FAULT)]}))
        emit(recipeReference('root'), ['VV'])

        observer.observe(chain())
        emit(recipeReference('inner'), ['class'])
        expect(latest(states)).toEqual(state({
            status: 'READY',
            description: described('root', [band('class', 'mode')])
        }))

        observer.cancel()
        expect(latest(states)).toEqual(state({status: 'PENDING'}))
    })
})

describe('observations are attached to their own reference', () => {
    it('keeps out-of-order completions attached correctly', () => {
        const {observer, states, emit} = observerOver()
        observer.observe(twoBranches())
        emit(recipeReference('b'), ['class'])
        emit(recipeReference('a'), ['VV'])

        expect(latest(states)).toEqual(state({
            status: 'READY',
            description: described('root', [band('VV', 'sample'), band('class', 'mode')])
        }))
    })

    it('observes a shared reference once across a diamond', () => {
        const {observer, requests, emit} = observerOver()
        observer.observe(graph({
            recipes: [
                node('root', COMBINE),
                node('a', PASS_THROUGH),
                node('shared', SAMPLED),
                node('b', PASS_THROUGH)
            ],
            edges: [
                edge('root', 'left', recipeReference('a')),
                edge('root', 'right', recipeReference('b')),
                edge('a', 'image', recipeReference('shared')),
                edge('b', 'image', recipeReference('shared'))
            ]
        }))
        emit(recipeReference('shared'), ['VV'])

        expect(requests.filter(({reference: {id}}) => id === 'shared')).toHaveLength(1)
    })

    it('observes a shared asset once when two edges select it', () => {
        const leaf = assetReference('users/x/leaf')
        const {observer, requests} = observerOver()
        observer.observe(graph({
            recipes: [node('root', COMBINE)],
            edges: [
                edge('root', 'left', leaf),
                edge('root', 'right', leaf)
            ]
        }))

        expect(requests).toEqual([{reference: leaf}])
    })

    // A replaced observation is unsubscribed, and a closed subscriber cannot publish. No epoch is
    // involved: unsubscription is the entire mechanism at this boundary.
    it('cannot be published by an observation that was replaced', () => {
        const {observer, states, torndown, subjectsByKey, subjectOf, emit} = observerOver()
        const replaced = subjectOf(recipeReference('inner'))
        observer.observe(chain())
        expect(torndown).toEqual([])

        delete subjectsByKey['RECIPE_REF:inner']
        observer.observe(graph({
            recipes: [node('root', PASS_THROUGH), node('inner', SAMPLED)],
            edges: [edge('root', 'image', recipeReference('inner'))]
        }))
        // Torn down as observe() replaces it, not merely suppressed when it later emits.
        expect(torndown).toEqual(['RECIPE_REF:inner'])

        emit(recipeReference('inner'), ['VV'])
        const current = latest(states)

        replaced.next(['class', 'probability'])
        replaced.complete()
        expect(current).toEqual(state({
            status: 'READY',
            description: described('root', [band('VV', 'sample')])
        }))
        expect(latest(states)).toBe(current)
    })
})

describe('synchronous reentrancy', () => {
    it('never starts an observation superseded by a switch on loading', () => {
        const {observer, states, requests, torndown} = observerOver()
        let switched = false
        observer.state$.subscribe(({status}) => {
            if (status === 'LOADING' && !switched) {
                switched = true
                observer.observe(twoBranches())
            }
        })
        observer.observe(chain())

        expect(requests.map(({reference}) => reference))
            .toEqual([recipeReference('a'), recipeReference('b')])
        expect(requests.map(({reference: {id}}) => id)).not.toContain('inner')

        observer.cancel()
        expect([...torndown].sort()).toEqual(['RECIPE_REF:a', 'RECIPE_REF:b'])
        expect(latest(states)).toEqual(state({status: 'PENDING'}))
    })

    it('keeps an observation started synchronously from a ready notification', () => {
        const {observer, states, torndown} = observerOver({synchronous: {'RECIPE_REF:first': ['VV']}})
        let restarted = false
        observer.state$.subscribe(({status}) => {
            if (status === 'READY' && !restarted) {
                restarted = true
                observer.observe(twoBranches())
            }
        })
        observer.observe(graph({recipes: [node('first', SAMPLED)]}))

        expect(latest(states)).toEqual(state({status: 'LOADING'}))
        expect(torndown).toContain('RECIPE_REF:first')
        expect(torndown).not.toContain('RECIPE_REF:a')

        observer.cancel()
        expect([...torndown].sort()).toEqual(['RECIPE_REF:a', 'RECIPE_REF:b', 'RECIPE_REF:first'])
        expect(latest(states)).toEqual(state({status: 'PENDING'}))
    })
})

describe('assets carry no guessed policy', () => {
    it('resolves an observed asset schema without inventing export authority', () => {
        const leaf = assetReference('users/x/leaf')
        const {observer, states, emit} = observerOver()
        observer.observe(graph({
            recipes: [node('root', PASS_THROUGH)],
            edges: [edge('root', 'image', leaf)]
        }))
        emit(leaf, ['B1'])

        expect(latest(states)).toEqual(state({
            status: 'READY',
            description: described('root', [band('B1')])
        }))
    })
})

describe('array-valued asset evidence', () => {
    const graphOver = leaf => graph({
        recipes: [node('root', PASS_THROUGH)],
        edges: [edge('root', 'image', leaf)]
    })

    it('resolves array bands as sample in physical order, independent of their names', () => {
        const leaf = assetReference('users/x/arrays')
        const {observer, states, emit} = observerOver()
        observer.observe(graphOver(leaf))
        emit(leaf, [
            {name: 'future_matrix', arrayDimensions: 2},
            {name: 'tStart', arrayDimensions: 1},
            {name: 'class', arrayDimensions: 3}
        ])

        expect(latest(states)).toEqual(state({
            status: 'READY',
            description: described('root', [
                band('future_matrix', 'sample', {arrayDimensions: 2}),
                band('tStart', 'sample', {arrayDimensions: 1}),
                band('class', 'sample', {arrayDimensions: 3})
            ])
        }))
    })

    it('resolves a scalar asset schema while leaving its export policy unknown', () => {
        const leaf = assetReference('users/x/scalar')
        const {observer, states, emit} = observerOver()
        observer.observe(graphOver(leaf))
        emit(leaf, [{name: 'B1', arrayDimensions: 0}])

        expect(latest(states)).toEqual(state({
            status: 'READY',
            description: described('root', [band('B1', undefined, {arrayDimensions: 0})])
        }))
    })

    it('returns the complete mixed schema without guessing a scalar policy', () => {
        const leaf = assetReference('users/x/mixed')
        const {observer, states, emit} = observerOver()
        observer.observe(graphOver(leaf))
        emit(leaf, [
            {name: 'array', arrayDimensions: 1},
            {name: 'scalar', arrayDimensions: 0}
        ])

        expect(latest(states)).toEqual(state({
            status: 'READY',
            description: described('root', [
                band('array', 'sample', {arrayDimensions: 1}),
                band('scalar', undefined, {arrayDimensions: 0})
            ])
        }))
    })

    // Missing evidence is never taken for a scalar or an array: an asset reported without a band's dimensionality is
    // not described.
    it('is invalid for an asset observed without a band\'s dimensionality', () => {
        const leaf = assetReference('users/x/unreported')
        const {observer, states, emit} = observerOver()
        observer.observe(graphOver(leaf))
        emit(leaf, [{name: 'scalar', arrayDimensions: 0}, {name: 'unreported'}])

        expect(latest(states)).toEqual(state({
            status: 'INVALID',
            diagnostics: [{code: 'INCOMPLETE_IMAGE_OUTPUT', path: ['bands', 1, 'dataType'], recipePath: ['root'], reference: leaf}]
        }))
    })

    it('does not replace a recipe declaration with the physical array default', () => {
        const {observer, states, emit} = observerOver()
        observer.observe(chain())
        emit(recipeReference('inner'), [
            {name: 'class', arrayDimensions: 1},
            {name: 'probability', arrayDimensions: 2}
        ])

        expect(latest(states)).toEqual(state({
            status: 'READY',
            description: described('root', [
                band('class', 'mode', {arrayDimensions: 1}),
                band('probability', 'mean', {arrayDimensions: 2})
            ])
        }))
    })
})

describe('graph and resolver classification', () => {
    it('is invalid for a malformed asset observation, which is wrong rather than unknown', () => {
        const leaf = assetReference('users/x/leaf')
        const {observer, states, emit} = observerOver()
        observer.observe(graph({
            recipes: [node('root', PASS_THROUGH)],
            edges: [edge('root', 'image', leaf)]
        }))
        emit(leaf, ['B1', 'B1'])

        expect(latest(states)).toEqual(state({
            status: 'INVALID',
            diagnostics: [
                {code: 'DUPLICATE_BAND_NAME', path: ['bands', 1, 'name'], recipePath: ['root'], reference: leaf}
            ]
        }))
    })

    // The GUI catalogue is reference-counted and drops an entry when the last component using it
    // unmounts, so a referenced recipe missing from it is routinely still saved and merely not loaded.
    const missingSource = {
        code: 'MISSING_SOURCE',
        role: 'image',
        path: ['model', 'image'],
        recipePath: ['root', 'elsewhere']
    }
    const readingMissing = root => graph({
        recipes: [root],
        edges: [edge('root', 'image', recipeReference('elsewhere'), missingSource)],
        diagnostics: [missingSource]
    })

    it('treats an unloaded reference it reads as unavailable, never as a deleted recipe', () => {
        const {observer, states, requests} = observerOver()
        observer.observe(readingMissing(node('root', PASS_THROUGH)))

        expect(latest(states)).toEqual(state({status: 'UNAVAILABLE', diagnostics: [missingSource]}))
        expect(requests).toEqual([])
    })

    // Whether the recipe can run is the complete graph's question. Its description depends only on what it reads.
    it('describes a recipe whose broken dependency it does not read', () => {
        const {observer, states, requests} = observerOver()
        observer.observe(readingMissing({...node('root', CONFIGURED), configuredBands: [band('a', 'mean')]}))

        expect(latest(states)).toEqual(state({status: 'READY', description: described('root', [band('a', 'mean')])}))
        expect(requests).toEqual([])
    })

    it('is invalid for a cycle among the recipes it reads, without observing any', () => {
        const {observer, states, requests} = observerOver()
        observer.observe(graph({
            recipes: [node('root', PASS_THROUGH), node('inner', PASS_THROUGH)],
            edges: [edge('root', 'image', recipeReference('inner')), edge('inner', 'image', recipeReference('root'))]
        }))

        expect(latest(states)).toEqual(state({
            status: 'INVALID',
            diagnostics: [{code: 'CYCLIC_DEPENDENCY', role: 'image', path: ['model', 'image'], recipePath: ['root', 'inner', 'root']}]
        }))
        expect(requests).toEqual([])
    })

    it('is invalid when a cycle it reads accompanies a missing source it reads, in read order', () => {
        const {observer, states, requests} = observerOver()
        observer.observe(graph({
            recipes: [node('root', COMBINE), node('inner', PASS_THROUGH)],
            edges: [
                edge('root', 'image', recipeReference('elsewhere'), missingSource),
                edge('root', 'other', recipeReference('inner')),
                edge('inner', 'image', recipeReference('root'))
            ],
            diagnostics: [missingSource]
        }))

        expect(latest(states)).toEqual(state({
            status: 'INVALID',
            diagnostics: [
                missingSource,
                {code: 'CYCLIC_DEPENDENCY', role: 'image', path: ['model', 'image'], recipePath: ['root', 'inner', 'root']}
            ]
        }))
        expect(requests).toEqual([])
    })

    it('is invalid for a loaded recipe with no image output, without observing it', () => {
        const {observer, states, requests} = observerOver()
        observer.observe(graph({recipes: [node('root', NON_IMAGE)]}))

        expect(latest(states)).toEqual(state({
            status: 'INVALID',
            diagnostics: [{code: 'NON_IMAGE_OUTPUT', path: [], recipePath: ['root']}]
        }))
        expect(requests).toEqual([])
    })

    // No observation could make a recipe with no image output an image, so one beside it is not requested.
    it('is invalid for an input with no image output beside one only observation describes, requesting nothing', () => {
        const {observer, states, requests} = observerOver()

        observer.observe(graph({
            recipes: [node('root', COMBINE), node('design', NON_IMAGE), node('observed', SAMPLED)],
            edges: [
                edge('root', 'left', recipeReference('design')),
                edge('root', 'right', recipeReference('observed'))
            ]
        }))

        expect(latest(states)).toEqual(state({
            status: 'INVALID',
            diagnostics: [{code: 'NON_IMAGE_OUTPUT', path: [], recipePath: ['root', 'design']}]
        }))
        expect(requests).toEqual([])
    })

    it('is invalid when a declaration produces a malformed candidate', () => {
        const {observer, states, emit} = observerOver()
        observer.observe(graph({recipes: [node('root', DUPLICATING)]}))
        emit(recipeReference('root'), ['a', 'b'])

        expect(latest(states)).toEqual(state({
            status: 'INVALID',
            diagnostics: [{code: 'DUPLICATE_BAND_NAME', path: ['bands', 1, 'name'], recipePath: ['root']}]
        }))
    })
})

describe('descriptions stay outside recipes', () => {
    it('never writes evidence into the recipe objects it was given', () => {
        const recipes = [node('root', PASS_THROUGH), node('inner', SAMPLED)]
        const before = JSON.stringify(recipes)
        const {observer, states, emit} = observerOver()
        observer.observe(graph({
            recipes,
            edges: [edge('root', 'image', recipeReference('inner'))]
        }))
        emit(recipeReference('inner'), ['VV'])

        expect(latest(states)).toEqual(state({
            status: 'READY',
            description: described('root', [band('VV', 'sample')])
        }))
        expect(JSON.stringify(recipes)).toEqual(before)
        expect(Object.keys(recipes[0])).toEqual(['id', 'type'])
        expect(Object.keys(recipes[1])).toEqual(['id', 'type'])
    })
})

// One description of one graph, for a consumer that asks once rather than watching: GUI evidence acquisition
// and a Task export both need exactly this, over their own acquisition.
describe('one settled description', () => {
    it('settles on the first description and completes', () => {
        const {settled$, emit} = settledOver()
        const result = collect(settled$(chain()))
        expect(result.settled).toEqual([])

        emit(recipeReference('inner'), ['class'])

        expect(result.only()).toEqual(state({
            status: 'READY',
            description: described('root', [band('class', 'mode')])
        }))
        expect(result.completed()).toBe(true)
    })

    it('settles synchronously where configuration alone describes the graph', () => {
        const configured = [band('red', undefined, {arrayDimensions: 0})]
        const {settled$, requests} = settledOver()

        const result = collect(settled$(graph({
            recipes: [node('root', PASS_THROUGH), {id: 'inner', type: CONFIGURED, configuredBands: configured}],
            edges: [edge('root', 'image', recipeReference('inner'))]
        })))

        expect(requests).toEqual([])
        expect(result.only()).toEqual(state({status: 'READY', description: described('root', configured)}))
        expect(result.completed()).toBe(true)
    })

    it('settles synchronously where the acquisition answers at once', () => {
        const {settled$} = settledOver({synchronous: {'RECIPE_REF:inner': ['class']}})

        const result = collect(settled$(chain()))

        expect(result.only()).toEqual(state({
            status: 'READY',
            description: described('root', [band('class', 'mode')])
        }))
        expect(result.completed()).toBe(true)
    })

    it('settles as unavailable on a failed acquisition, keeping its error', () => {
        const failure = new Error('earth engine unavailable')
        const {settled$, subjectOf} = settledOver()

        const result = collect(settled$(chain()))
        subjectOf(recipeReference('inner')).error(failure)

        expect(result.only()).toEqual(state({status: 'UNAVAILABLE', error: failure}))
        expect(result.only().error).toBe(failure)
        expect(result.completed()).toBe(true)
    })

    it('settles as invalid on a faulting provider, keeping its cause', () => {
        const {settled$, emit} = settledOver()

        const result = collect(settled$(graph({recipes: [node('root', INTERPRETING_FAULT)]})))
        emit(recipeReference('root'), ['VV'])

        expect(result.only()).toEqual(state({status: 'INVALID', error: PROVIDER_FAULT}))
        expect(result.only().error).toBe(PROVIDER_FAULT)
        expect(result.completed()).toBe(true)
    })

    it('settles on the diagnostics of a graph it cannot describe', () => {
        const {settled$, requests} = settledOver()
        const missing = {code: 'MISSING_SOURCE', role: 'image', path: ['model', 'image'], recipePath: ['root', 'missing']}

        const result = collect(settled$(graph({
            recipes: [node('root', PASS_THROUGH)],
            edges: [edge('root', 'image', recipeReference('missing'), missing)],
            diagnostics: [missing]
        })))

        expect(requests).toEqual([])
        expect(result.only()).toEqual(state({status: 'UNAVAILABLE', diagnostics: [missing]}))
        expect(result.completed()).toBe(true)
    })

    it('releases the observation when the subscriber leaves before it settles', () => {
        const {settled$, torndown} = settledOver()

        const result = collect(settled$(chain()))
        expect(torndown).toEqual([])

        result.subscription.unsubscribe()

        expect(torndown).toEqual(['RECIPE_REF:inner'])
        expect(result.settled).toEqual([])
    })

    it('releases the observation once it has settled', () => {
        const {settled$, torndown, emit} = settledOver()

        collect(settled$(chain()))
        emit(recipeReference('inner'), ['class'])

        expect(torndown).toEqual(['RECIPE_REF:inner'])
    })

    it('gives every subscription its own observation, and lets one leave without disturbing the other', () => {
        const {settled$, requests, torndown, emit} = settledOver()
        const once$ = settled$(chain())

        const first = collect(once$)
        const second = collect(once$)
        expect(requests).toHaveLength(2)

        first.subscription.unsubscribe()
        expect(torndown).toEqual(['RECIPE_REF:inner'])

        emit(recipeReference('inner'), ['class'])
        expect(first.settled).toEqual([])
        expect(second.only()).toEqual(state({
            status: 'READY',
            description: described('root', [band('class', 'mode')])
        }))
    })
})
