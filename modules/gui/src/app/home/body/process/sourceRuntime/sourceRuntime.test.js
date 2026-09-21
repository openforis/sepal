import {Observable, Subject} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

// The one-shot source-runtime operation, exercised directly. The shared graph builder, registry, CCDC and MASKING
// declarations, resolver, observer and the committed GUI observer adapter all really run; only the Earth Engine
// bands API and the Redux environment are replaced.
//
// Nothing is rendered here. Provider, Redux ordering and rerender behavior are proven separately against a real
// store in sourceRuntimeContext.test.jsx.
//
// Persisted types, statuses and error codes are written as literals: a production rename must not make these pass.

const state = vi.hoisted(() => ({
    bandsCalls: [],
    subscribers: new Map(),
    torndown: [],
    recipeCalls: [],
    recipeSubscribers: new Map(),
    recipeTorndown: []
}))

vi.mock('~/apiRegistry', async () => {
    const {Observable} = await import('rxjs')
    return {
        default: {
            gee: {
                bands$: params => {
                    state.bandsCalls.push(params)
                    const key = params.asset ? `ASSET:${params.asset}` : `RECIPE_REF:${params.recipe?.id}`
                    return new Observable(subscriber => {
                        state.subscribers.set(key, subscriber)
                        return () => state.torndown.push(key)
                    })
                }
            },
            recipe: {
                load$: id => {
                    state.recipeCalls.push(id)
                    return new Observable(subscriber => {
                        state.recipeSubscribers.set(id, subscriber)
                        return () => state.recipeTorndown.push(id)
                    })
                }
            }
        }
    }
})

// The singleton store helpers must not be reachable from the runtime.
vi.mock('~/store', () => ({
    select: () => {
        throw new Error('source runtime must not use the singleton select()')
    },
    subscribe: () => {
        throw new Error('source runtime must not use the singleton subscribe()')
    }
}))

const {createSourceRuntime} = await import('./sourceRuntime')

beforeEach(() => {
    state.bandsCalls = []
    state.subscribers = new Map()
    state.torndown = []
    state.recipeCalls = []
    state.recipeSubscribers = new Map()
    state.recipeTorndown = []
})

const emit = (key, bandNames) => {
    const subscriber = state.subscribers.get(key)
    subscriber?.next(bandNames)
    subscriber?.complete()
}

const fail = (key, error) => state.subscribers.get(key)?.error(error)

const emitRecipe = (id, recipe) => {
    const subscriber = state.recipeSubscribers.get(id)
    subscriber?.next(recipe)
    subscriber?.complete()
}

const failRecipe = (id, error) => state.recipeSubscribers.get(id)?.error(error)

const ccdc = (id = 'ccdc-1') => ({id, type: 'CCDC', model: {}})

const masking = ({primary, mask, id = 'masked-1'}) => ({
    id,
    type: 'MASKING',
    model: {imageToMask: primary, imageMask: mask}
})

const recipeSelection = id => ({type: 'RECIPE_REF', id})
const assetSelection = id => ({type: 'ASSET', id})

const remapping = (id, sourceId) => ({
    id,
    type: 'REMAPPING',
    model: {
        inputImagery: {
            images: [{imageId: `${id}-image`, type: 'RECIPE_REF', id: sourceId}]
        }
    }
})

const catalogue = recipes => Object.fromEntries(recipes.map(recipe => [recipe.id, recipe]))

const environment = ({catalogue: records = {}, earthEngineGeneration = 1}) =>
    ({catalogue: records, earthEngineGeneration})

// A controllable environment: one synchronous value on subscribe, then only session changes, as the real adapter
// promises. `subscribeCount` proves the operation - not the runtime - owns the Redux subscription lifetime.
const environmentOf = () => {
    const changes = new Subject()
    let current = environment({})
    let closed = false
    let subscribeCount = 0
    let liveCount = 0
    return {
        set: next => current = next,
        change: next => {
            current = next
            changes.next(next)
        },
        close: () => {
            closed = true
            changes.complete()
        },
        fail: error => changes.error(error),
        subscribeCount: () => subscribeCount,
        liveCount: () => liveCount,
        environment$: new Observable(subscriber => {
            subscribeCount++
            liveCount++
            if (closed) {
                subscriber.complete()
                liveCount--
                return
            }
            // Listening before emitting, as the real adapter does: a change raised from within the first
            // notification must not be lost.
            const inner = changes.subscribe(subscriber)
            subscriber.next(current)
            return () => {
                liveCount--
                inner.unsubscribe()
            }
        })
    }
}

const observing = ({environment$, recipe, createObserver}) => {
    const runtime = createSourceRuntime(createObserver ? {environment$, createObserver} : {environment$})
    const states = []
    let completed = false
    let errored = null
    const subscription = runtime.resolveImageOutput$({recipe}).subscribe({
        next: published => states.push(published),
        error: error => errored = error,
        complete: () => completed = true
    })
    return {
        states,
        subscription,
        completed: () => completed,
        errored: () => errored,
        latest: () => states[states.length - 1]
    }
}

const envelope = ({status, description = null, diagnostics = [], error = null}) =>
    ({status, description, diagnostics, error})

const sampled = bands => bands.map(({name, arrayDimensions}) => ({
    name,
    dataType: {arrayDimensions},
    pyramidingPolicy: 'sample'
}))

// What an asset holding segments shows, and - separately - the names CCDC says it can be asked for, whose
// physical facts its own declaration supplies.
const CCDC_BANDS = [
    {name: 'tStart', arrayDimensions: 1},
    {name: 'ndvi_coefs', arrayDimensions: 2}
]

const DECLARED_CCDC_BANDS = ['tStart', 'ndvi_coefs']

describe('capturing the environment', () => {
    it('subscribes to the environment only when the operation is subscribed', () => {
        const env = environmentOf()
        const runtime = createSourceRuntime({environment$: env.environment$})
        const operation$ = runtime.resolveImageOutput$({recipe: ccdc()})

        expect(env.subscribeCount()).toBe(0)
        expect(state.bandsCalls).toEqual([])

        operation$.subscribe()
        expect(env.subscribeCount()).toBe(1)
    })

    it('captures the catalogue as it is at subscription, not at creation', () => {
        const env = environmentOf()
        const inner = ccdc()
        const recipe = masking({primary: recipeSelection('ccdc-1'), mask: assetSelection('users/x/mask')})
        const runtime = createSourceRuntime({environment$: env.environment$})
        const operation$ = runtime.resolveImageOutput$({recipe})

        env.set(environment({catalogue: catalogue([inner])}))
        operation$.subscribe()

        expect(state.bandsCalls).toEqual([{recipe: inner}])
    })

    it('gives two subscriptions independent snapshots', () => {
        const env = environmentOf()
        const recipe = masking({primary: recipeSelection('ccdc-1'), mask: assetSelection('users/x/mask')})
        const runtime = createSourceRuntime({environment$: env.environment$})
        const operation$ = runtime.resolveImageOutput$({recipe})

        operation$.subscribe()
        expect(state.bandsCalls).toEqual([])

        env.set(environment({catalogue: catalogue([ccdc()])}))
        operation$.subscribe()
        expect(state.bandsCalls).toEqual([{recipe: ccdc()}])
        expect(env.subscribeCount()).toBe(2)
    })

    it('ignores a catalogue replacement once an operation is in flight', () => {
        const env = environmentOf()
        const inner = ccdc()
        const recipe = masking({primary: recipeSelection('ccdc-1'), mask: assetSelection('users/x/mask')})
        env.set(environment({catalogue: catalogue([inner])}))
        const runtime = createSourceRuntime({environment$: env.environment$})
        runtime.resolveImageOutput$({recipe}).subscribe()

        env.change(environment({catalogue: {}, earthEngineGeneration: 1}))

        expect(state.bandsCalls).toEqual([{recipe: inner}])
        expect(state.torndown).toEqual([])
    })

    // The recipe being edited carries unsaved changes; the catalogue holds whatever was last committed to it.
    it('resolves the passed root, not an older catalogue record with the same id', () => {
        const env = environmentOf()
        const stale = masking({
            primary: recipeSelection('stale-source'),
            mask: assetSelection('users/x/mask')
        })
        const current = masking({primary: recipeSelection('ccdc-1'), mask: assetSelection('users/x/mask')})
        env.set(environment({catalogue: catalogue([stale, ccdc()])}))
        const runtime = createSourceRuntime({environment$: env.environment$})
        runtime.resolveImageOutput$({recipe: current}).subscribe()

        expect(state.bandsCalls).toEqual([{recipe: ccdc()}])
    })
})

describe('completing the operation-local recipe closure', () => {
    const nestedMask = () => {
        const env = environmentOf()
        const mask = remapping('mask-1', 'nested-1')
        const recipe = masking({
            primary: assetSelection('users/x/segments'),
            mask: recipeSelection('mask-1')
        })
        env.set(environment({catalogue: catalogue([recipe, mask])}))
        return {env, mask, recipe}
    }

    it('loads a missing transitive recipe before asset-band observation and keeps it out of the seed', () => {
        const {env, recipe} = nestedMask()
        const observed = observing({environment$: env.environment$, recipe})

        expect(state.recipeCalls).toEqual(['nested-1'])
        expect(state.bandsCalls).toEqual([])
        expect(observed.states.map(({status}) => status)).toEqual(['LOADING'])

        emitRecipe('nested-1', ccdc('nested-1'))

        expect(state.bandsCalls).toEqual([{
            asset: 'users/x/segments',
            includeDataTypes: true
        }])
        emit('ASSET:users/x/segments', CCDC_BANDS)
        expect(observed.latest().status).toBe('READY')
        expect(observed.latest().description.executionReference).toEqual({
            type: 'RECIPE_REF',
            id: 'masked-1'
        })
    })

    it('turns a missing or forbidden recipe response into runtime UNAVAILABLE', () => {
        const {env, recipe} = nestedMask()
        const failure = Object.assign(new Error('forbidden'), {status: 403})
        const observed = observing({environment$: env.environment$, recipe})

        failRecipe('nested-1', failure)

        expect(observed.latest()).toEqual(envelope({status: 'UNAVAILABLE', error: failure}))
        expect(observed.latest().diagnostics).toEqual([])
        expect(state.bandsCalls).toEqual([])
    })

    it('turns a closure limit failure into UNAVAILABLE without using the public error channel', () => {
        const env = environmentOf()
        const recipe = masking({
            primary: recipeSelection('nested-1'),
            mask: assetSelection('users/x/mask')
        })
        env.set(environment({catalogue: {}}))
        const runtime = createSourceRuntime({
            environment$: env.environment$,
            closureLimits: {
                maxDepth: 16,
                maxNodes: 1,
                maxSerializedBytes: 8 * 1024 * 1024,
                maxLoadingRounds: 16,
                maxFrontierSize: 32,
                requestConcurrency: 4
            }
        })
        const states = []
        let errored = null
        runtime.resolveImageOutput$({recipe}).subscribe({
            next: state => states.push(state),
            error: error => errored = error
        })

        expect(states).toEqual([envelope({
            status: 'UNAVAILABLE',
            error: expect.objectContaining({code: 'RECIPE_CLOSURE_NODE_LIMIT'})
        })])
        expect(errored).toBe(null)
        expect(state.recipeCalls).toEqual([])
        expect(state.bandsCalls).toEqual([])
    })

    it('does not write loaded records into the captured session catalogue', () => {
        const {env, recipe} = nestedMask()
        observing({environment$: env.environment$, recipe})

        emitRecipe('nested-1', ccdc('nested-1'))

        expect(state.recipeCalls).toEqual(['nested-1'])
        env.set(environment({catalogue: {}}))
        const next = observing({environment$: env.environment$, recipe})
        expect(state.recipeCalls).toEqual(['nested-1', 'mask-1'])
        next.subscription.unsubscribe()
    })
})

describe('the one-shot envelope', () => {
    const maskedCcdc = () => {
        const env = environmentOf()
        const recipe = masking({primary: recipeSelection('ccdc-1'), mask: assetSelection('users/x/mask')})
        env.set(environment({catalogue: catalogue([recipe, ccdc()])}))
        return {env, recipe}
    }

    it('emits LOADING, one terminal READY and completes, never emitting PENDING', () => {
        const {env, recipe} = maskedCcdc()
        const observed = observing({environment$: env.environment$, recipe})
        emit('RECIPE_REF:ccdc-1', DECLARED_CCDC_BANDS)

        expect(observed.states.map(({status}) => status)).toEqual(['LOADING', 'READY'])
        expect(observed.latest()).toEqual(envelope({
            status: 'READY',
            description: {
                executionReference: {type: 'RECIPE_REF', id: 'masked-1'},
                output: {kind: 'IMAGE', bands: sampled(CCDC_BANDS)},
                evidence: []
            }
        }))
        expect(observed.completed()).toBe(true)
        expect(observed.errored()).toBe(null)
    })

    // A definitive graph diagnosis needs no observation, so there is nothing to be loading.
    it('emits no LOADING when a definitive diagnosis resolves synchronously', () => {
        const env = environmentOf()
        const recipe = masking({primary: recipeSelection('masked-1'), mask: assetSelection('users/x/mask')})
        env.set(environment({catalogue: catalogue([recipe])}))
        const observed = observing({environment$: env.environment$, recipe})

        expect(observed.states.map(({status}) => status)).toEqual(['INVALID'])
        expect(observed.latest().diagnostics[0]).toMatchObject({code: 'CYCLIC_DEPENDENCY'})
        expect(state.bandsCalls).toEqual([])
        expect(observed.completed()).toBe(true)
    })

    it('turns an observation failure into UNAVAILABLE, keeping the error and not erroring the stream', () => {
        const {env, recipe} = maskedCcdc()
        const failure = new Error('ajax error')
        const observed = observing({environment$: env.environment$, recipe})
        fail('RECIPE_REF:ccdc-1', failure)

        expect(observed.latest()).toEqual(envelope({status: 'UNAVAILABLE', error: failure}))
        expect(observed.latest().error).toBe(failure)
        expect(observed.errored()).toBe(null)
        expect(observed.completed()).toBe(true)
    })

    it('turns an unexpected runtime failure into UNAVAILABLE rather than the error channel', () => {
        const env = environmentOf()
        const broken = new Error('graph construction failed')
        const observed = observing({
            environment$: env.environment$,
            recipe: ccdc(),
            createObserver: () => {
                throw broken
            }
        })

        expect(observed.latest()).toEqual(envelope({status: 'UNAVAILABLE', error: broken}))
        expect(observed.errored()).toBe(null)
        expect(observed.completed()).toBe(true)
    })

    it('tears down its own observation and environment subscription on completion', () => {
        const {env, recipe} = maskedCcdc()
        observing({environment$: env.environment$, recipe})
        emit('RECIPE_REF:ccdc-1', DECLARED_CCDC_BANDS)

        expect(state.torndown).toEqual(['RECIPE_REF:ccdc-1'])
        expect(env.liveCount()).toBe(0)
    })

    it('tears down only the cancelled operation when two overlap', () => {
        const env = environmentOf()
        const a = masking({id: 'a', primary: recipeSelection('ccdc-a'), mask: assetSelection('users/x/mask')})
        const b = masking({id: 'b', primary: recipeSelection('ccdc-b'), mask: assetSelection('users/x/mask')})
        env.set(environment({catalogue: catalogue([ccdc('ccdc-a'), ccdc('ccdc-b')])}))
        const runtime = createSourceRuntime({environment$: env.environment$})
        const first = runtime.resolveImageOutput$({recipe: a}).subscribe()
        runtime.resolveImageOutput$({recipe: b}).subscribe()

        first.unsubscribe()

        expect(state.torndown).toEqual(['RECIPE_REF:ccdc-a'])
        expect(env.liveCount()).toBe(1)
    })
})

describe('runtime invalidation', () => {
    const closureInFlight = (id = 'nested-1') => {
        const env = environmentOf()
        const recipe = masking({
            primary: recipeSelection(id),
            mask: assetSelection('users/x/mask')
        })
        env.set(environment({catalogue: {}}))
        return {env, observed: observing({environment$: env.environment$, recipe})}
    }

    it('cancels an outstanding recipe request when its operation is unsubscribed', () => {
        const {observed} = closureInFlight()

        observed.subscription.unsubscribe()

        expect(state.recipeTorndown).toEqual(['nested-1'])
        expect(state.bandsCalls).toEqual([])
    })

    it('cancels closure loading when Earth Engine identity changes', () => {
        const {env, observed} = closureInFlight()

        env.change(environment({catalogue: {}, earthEngineGeneration: 2}))

        expect(observed.latest()).toEqual(envelope({
            status: 'UNAVAILABLE',
            error: expect.objectContaining({code: 'SOURCE_IDENTITY_CHANGED'})
        }))
        expect(state.recipeTorndown).toEqual(['nested-1'])
        expect(state.bandsCalls).toEqual([])
    })

    it('cancels closure loading when the Process runtime scope closes', () => {
        const {env, observed} = closureInFlight()

        env.close()

        expect(observed.latest()).toEqual(envelope({
            status: 'UNAVAILABLE',
            error: expect.objectContaining({code: 'SOURCE_RUNTIME_UNAVAILABLE'})
        }))
        expect(state.recipeTorndown).toEqual(['nested-1'])
        expect(state.bandsCalls).toEqual([])
    })

    it('tears down one closure request without cancelling an overlapping sibling operation', () => {
        const first = closureInFlight('first-child')
        const second = closureInFlight('second-child')

        first.observed.subscription.unsubscribe()

        expect(state.recipeTorndown).toEqual(['first-child'])
        expect(state.recipeSubscribers.get('second-child')?.closed).toBe(false)
        second.observed.subscription.unsubscribe()
    })

    // Invalidating from inside the LOADING notification is the reentrant case: the subscription is being set up
    // while the callback runs. Previous defects in this area all came from work started before its owner existed.
    it('handles a generation change published from within the LOADING callback', () => {
        const env = environmentOf()
        const recipe = masking({primary: recipeSelection('ccdc-1'), mask: assetSelection('users/x/mask')})
        env.set(environment({catalogue: catalogue([recipe, ccdc()])}))
        const runtime = createSourceRuntime({environment$: env.environment$})
        const states = []
        let completed = false
        runtime.resolveImageOutput$({recipe}).subscribe({
            next: published => {
                states.push(published)
                if (published.status === 'LOADING') {
                    env.change(environment({catalogue: {}, earthEngineGeneration: 2}))
                }
            },
            complete: () => completed = true
        })

        expect(states.map(({status}) => status)).toEqual(['LOADING', 'UNAVAILABLE'])
        expect(states[1].error).toEqual(expect.objectContaining({code: 'SOURCE_IDENTITY_CHANGED'}))
        expect(completed).toBe(true)

        // Nothing is left running, and nothing had to be torn down: LOADING is published before the request
        // starts, so invalidating from inside that notification abandons the observation before it begins.
        expect(state.bandsCalls).toEqual([])
        expect(state.torndown).toEqual([])

        emit('RECIPE_REF:ccdc-1', DECLARED_CCDC_BANDS)
        expect(states).toHaveLength(2)
    })

    it('owns closure loading before a reentrant identity invalidation can start HTTP work', () => {
        const env = environmentOf()
        const recipe = masking({
            primary: recipeSelection('nested-1'),
            mask: assetSelection('users/x/mask')
        })
        env.set(environment({catalogue: {}}))
        const runtime = createSourceRuntime({environment$: env.environment$})
        const states = []

        runtime.resolveImageOutput$({recipe}).subscribe({
            next: published => {
                states.push(published)
                if (published.status === 'LOADING') {
                    env.change(environment({catalogue: {}, earthEngineGeneration: 2}))
                }
            }
        })

        expect(states.map(({status}) => status)).toEqual(['LOADING', 'UNAVAILABLE'])
        expect(states.at(-1).error).toEqual(expect.objectContaining({code: 'SOURCE_IDENTITY_CHANGED'}))
        expect(state.recipeCalls).toEqual([])
        expect(state.bandsCalls).toEqual([])
    })

    it('turns a failure of the environment itself into a terminal UNAVAILABLE', () => {
        const env = environmentOf()
        const failure = new Error('environment failed')
        env.set(environment({catalogue: catalogue([ccdc()])}))
        const observed = observing({environment$: env.environment$, recipe: ccdc()})
        env.fail(failure)

        expect(observed.latest()).toEqual(envelope({status: 'UNAVAILABLE', error: failure}))
        expect(observed.errored()).toBe(null)
        expect(observed.completed()).toBe(true)
    })

    const inFlight = () => {
        const env = environmentOf()
        const recipe = masking({primary: recipeSelection('ccdc-1'), mask: assetSelection('users/x/mask')})
        env.set(environment({catalogue: catalogue([recipe, ccdc()])}))
        return {env, observed: observing({environment$: env.environment$, recipe})}
    }

    // Replaced credentials mean the observation in flight was made under an identity that no longer applies. It is
    // runtime unavailability, not evidence about the recipe, so it carries an error and no diagnostic.
    it('reports an Earth Engine generation change as UNAVAILABLE with an explicit code', () => {
        const {env, observed} = inFlight()
        env.change(environment({catalogue: {}, earthEngineGeneration: 2}))

        expect(observed.latest()).toEqual(envelope({
            status: 'UNAVAILABLE',
            error: expect.objectContaining({code: 'SOURCE_IDENTITY_CHANGED'})
        }))
        expect(observed.latest().diagnostics).toEqual([])
        expect(observed.completed()).toBe(true)
        expect(state.torndown).toEqual(['RECIPE_REF:ccdc-1'])
    })

    it('reports closure of the owning runtime scope as UNAVAILABLE with its own code', () => {
        const {env, observed} = inFlight()
        env.close()

        expect(observed.latest()).toEqual(envelope({
            status: 'UNAVAILABLE',
            error: expect.objectContaining({code: 'SOURCE_RUNTIME_UNAVAILABLE'})
        }))
        expect(observed.completed()).toBe(true)
        expect(state.torndown).toEqual(['RECIPE_REF:ccdc-1'])
    })

    it('reports a subscription made after closure without observing anything', () => {
        const env = environmentOf()
        env.set(environment({catalogue: catalogue([ccdc()])}))
        env.close()
        const observed = observing({environment$: env.environment$, recipe: ccdc()})

        expect(observed.latest()).toEqual(envelope({
            status: 'UNAVAILABLE',
            error: expect.objectContaining({code: 'SOURCE_RUNTIME_UNAVAILABLE'})
        }))
        expect(state.bandsCalls).toEqual([])
        expect(observed.completed()).toBe(true)
    })

    it('carries no credential material on either error', () => {
        const {env, observed} = inFlight()
        env.change(environment({catalogue: {}, earthEngineGeneration: 2}))

        expect(observed.latest()).toEqual(envelope({
            status: 'UNAVAILABLE',
            error: expect.objectContaining({code: 'SOURCE_IDENTITY_CHANGED'})
        }))
        const {error} = observed.latest()
        expect(Object.keys(error)).toEqual(['code'])
        expect(error.message).toBe('Source runtime: SOURCE_IDENTITY_CHANGED')
    })
})
