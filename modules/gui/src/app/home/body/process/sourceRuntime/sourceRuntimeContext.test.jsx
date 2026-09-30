import React, {act, useRef} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

// The Redux boundary and the provider, against a REAL store and the real lazy adapter. A mocked store or action
// builder is more permissive than Redux itself, and the ordering guarantee this runtime depends on - subscribers
// run synchronously inside dispatch - only exists in the real thing.
//
// Only the Earth Engine bands API is replaced.

const state = vi.hoisted(() => ({bandsCalls: [], subscribers: new Map(), torndown: []}))

vi.mock('~/apiRegistry', async () => {
    const {Observable} = await import('rxjs')
    return {
        default: {
            gee: {
                bands$: params => {
                    state.bandsCalls.push(params)
                    const key = `RECIPE_REF:${params.recipe?.id}`
                    return new Observable(subscriber => {
                        state.subscribers.set(key, subscriber)
                        return () => state.torndown.push(key)
                    })
                }
            }
        }
    }
})

// The singleton helpers must not be reachable from this boundary. Any production use fails here rather than
// silently binding the runtime to the ambient store.
vi.mock('~/store', () => ({
    select: () => {
        throw new Error('source runtime must not use the singleton select()')
    },
    subscribe: () => {
        throw new Error('source runtime must not use the singleton subscribe()')
    },
    state: () => {
        throw new Error('source runtime must not use the singleton state()')
    },
    dispatch: () => {
        throw new Error('source runtime must not use the singleton dispatch()')
    }
}))

const {buildMapDependencyGraph} = await import('../recipe/mapDependencyGraph')
const {readRecipeOutput} = await import('../recipe/recipeOutput')
const {createReduxSourceEnvironment} = await import('./reduxSourceEnvironment')
const {createSourceRuntime} = await import('./sourceRuntime')
const {SourceRuntimeProvider, useSourceRuntime, withSourceRuntime} = await import('./sourceRuntimeContext')

const ccdc = (id = 'ccdc-1') => ({id, type: 'CCDC', model: {}})

const masking = ({primary}) => ({
    id: 'masked-1',
    type: 'MASKING',
    model: {imageToMask: primary, imageMask: {type: 'ASSET', id: 'users/x/mask'}}
})

const initialState = () => ({
    process: {loadedRecipes: {}},
    user: {currentUser: {googleTokens: {accessToken: 'secret-token'}}}
})

const reducer = (current = initialState(), action) =>
    action.state ? action.state : current

const withLoaded = (current, recipes) => ({
    ...current,
    process: {loadedRecipes: Object.fromEntries(recipes.map(recipe => [recipe.id, recipe]))}
})

const storeWith = () => createStore(reducer)

beforeEach(() => {
    state.bandsCalls = []
    state.subscribers = new Map()
    state.torndown = []
})

const runtimeFor = store => {
    const environment = createReduxSourceEnvironment({store})
    const runtime = createSourceRuntime({
        environment$: environment.environment$,
        session: environment.session,
        sessionChanges$: environment.sessionChanges$
    })
    return {environment, runtime}
}

// What a map layer or Retrieve renders from: the common read over the graph the store's records give.
const readOutput = (store, runtime, recipeId) => {
    const loadedRecipes = store.getState().process.loadedRecipes
    const recipe = loadedRecipes[recipeId]
    return readRecipeOutput({
        recipe,
        product: {name: 'IMAGE_OUTPUT'},
        graph: buildMapDependencyGraph({recipe, loadedRecipes}),
        heldFor: key => runtime.heldFor(key)
    })
}

const emitBands = (key, bandNames) => {
    const subscriber = state.subscribers.get(key)
    subscriber?.next(bandNames)
    subscriber?.complete()
}

const replaceCredentials = store =>
    store.dispatch({type: 'SET', state: {...store.getState(), user: {currentUser: {googleTokens: {accessToken: 'fresh'}}}}})

describe('the lazy Redux adapter', () => {
    it('subscribes to the store only when an operation subscribes', () => {
        const store = storeWith()
        const subscribe = vi.spyOn(store, 'subscribe')
        const {runtime} = runtimeFor(store)

        const operation$ = runtime.resolveImageOutput$({recipe: ccdc()})
        store.dispatch({type: 'SET', state: withLoaded(store.getState(), [ccdc()])})
        expect(subscribe).not.toHaveBeenCalled()
        expect(state.bandsCalls).toEqual([])

        operation$.subscribe()
        expect(subscribe).toHaveBeenCalledTimes(1)
    })

    // Redux runs store subscribers synchronously inside dispatch, so a command issued right after dispatch sees
    // that dispatch. This is the property a mocked store would grant for free and Redux actually guarantees.
    it('sees a catalogue dispatched immediately before subscription', () => {
        const store = storeWith()
        const {runtime} = runtimeFor(store)
        const inner = ccdc()
        const recipe = masking({primary: {type: 'RECIPE_REF', id: 'ccdc-1'}})

        store.dispatch({type: 'SET', state: withLoaded(store.getState(), [inner])})
        runtime.resolveImageOutput$({recipe}).subscribe()

        expect(state.bandsCalls).toEqual([{recipe: inner}])
    })

    it('applies a catalogue dispatched after creation but before subscription', () => {
        const store = storeWith()
        const {runtime} = runtimeFor(store)
        const inner = ccdc()
        const operation$ = runtime.resolveImageOutput$({recipe: masking({primary: {type: 'RECIPE_REF', id: 'ccdc-1'}})})

        store.dispatch({type: 'SET', state: withLoaded(store.getState(), [inner])})
        operation$.subscribe()

        expect(state.bandsCalls).toEqual([{recipe: inner}])
    })

    // Deliberately conservative: a replaced credential container invalidates, because the runtime may not inspect
    // credentials to tell a refresh from an account change.
    it('invalidates in-flight work when the credential container is replaced', () => {
        const store = storeWith()
        const {runtime} = runtimeFor(store)
        store.dispatch({type: 'SET', state: withLoaded(store.getState(), [ccdc()])})
        const states = []
        runtime.resolveImageOutput$({recipe: masking({primary: {type: 'RECIPE_REF', id: 'ccdc-1'}})})
            .subscribe(published => states.push(published))

        const current = store.getState()
        store.dispatch({type: 'SET', state: {...current, user: {currentUser: {googleTokens: {accessToken: 'fresh'}}}}})

        expect(states[states.length - 1]).toEqual({
            status: 'UNAVAILABLE',
            description: null,
            diagnostics: [],
            error: expect.objectContaining({code: 'SOURCE_IDENTITY_CHANGED'}),
            // The closure had completed; only the observation of its one source was cut short.
            dependencyValidity: {status: 'VALID', diagnostics: []},
            basis: expect.any(Array)
        })
    })

    it('does not invalidate on an unrelated update or the same credential container', () => {
        const store = storeWith()
        const {runtime} = runtimeFor(store)
        store.dispatch({type: 'SET', state: withLoaded(store.getState(), [ccdc()])})
        const states = []
        runtime.resolveImageOutput$({recipe: masking({primary: {type: 'RECIPE_REF', id: 'ccdc-1'}})})
            .subscribe(published => states.push(published))

        const current = store.getState()
        store.dispatch({type: 'SET', state: {...current, process: {loadedRecipes: {}}}})
        store.dispatch({type: 'SET', state: {...current, user: {currentUser: {googleTokens: current.user.currentUser.googleTokens}}}})

        expect(states.map(({status}) => status)).toEqual(['LOADING'])
    })

    it('never copies credential material into an emitted envelope', () => {
        const store = storeWith()
        const {runtime} = runtimeFor(store)
        store.dispatch({type: 'SET', state: withLoaded(store.getState(), [ccdc()])})
        const states = []
        runtime.resolveImageOutput$({recipe: masking({primary: {type: 'RECIPE_REF', id: 'ccdc-1'}})})
            .subscribe(published => states.push(published))

        const current = store.getState()
        store.dispatch({type: 'SET', state: {...current, user: {currentUser: {googleTokens: {accessToken: 'fresh'}}}}})

        expect(states[states.length - 1]).toEqual({
            status: 'UNAVAILABLE',
            description: null,
            diagnostics: [],
            error: expect.objectContaining({code: 'SOURCE_IDENTITY_CHANGED'}),
            // The closure had completed; only the observation of its one source was cut short.
            dependencyValidity: {status: 'VALID', diagnostics: []},
            basis: expect.any(Array)
        })
        expect(JSON.stringify(states)).not.toContain('secret-token')
        expect(JSON.stringify(states)).not.toContain('fresh')
        expect(JSON.stringify(states)).not.toContain('accessToken')
    })

    it('reports closure to detached work and to later subscriptions', () => {
        const store = storeWith()
        const {environment, runtime} = runtimeFor(store)
        store.dispatch({type: 'SET', state: withLoaded(store.getState(), [ccdc()])})
        const states = []
        runtime.resolveImageOutput$({recipe: masking({primary: {type: 'RECIPE_REF', id: 'ccdc-1'}})})
            .subscribe(published => states.push(published))

        environment.close()
        expect(states[states.length - 1]).toEqual({
            status: 'UNAVAILABLE',
            description: null,
            diagnostics: [],
            error: expect.objectContaining({code: 'SOURCE_RUNTIME_UNAVAILABLE'}),
            // The closure had completed; only the observation of its one source was cut short.
            dependencyValidity: {status: 'VALID', diagnostics: []},
            basis: expect.any(Array)
        })

        const later = []
        runtime.resolveImageOutput$({recipe: ccdc()}).subscribe(published => later.push(published))
        expect(later.map(({status}) => status)).toEqual(['UNAVAILABLE'])
    })
})

describe('the environment snapshot', () => {
    const captured = store => {
        const {environment$} = createReduxSourceEnvironment({store})
        const emissions = []
        const subscription = environment$.subscribe(value => emissions.push(value))
        return {emissions, subscription}
    }

    it('reads and subscribes to nothing until an operation subscribes', () => {
        const store = storeWith()
        const getState = vi.spyOn(store, 'getState')
        const subscribe = vi.spyOn(store, 'subscribe')
        const {environment$} = createReduxSourceEnvironment({store})

        expect(getState).not.toHaveBeenCalled()
        expect(subscribe).not.toHaveBeenCalled()

        environment$.subscribe()
        expect(getState).toHaveBeenCalled()
        expect(subscribe).toHaveBeenCalled()
    })

    it('publishes exactly the catalogue and an opaque credential generation', () => {
        const store = storeWith()
        const inner = ccdc()
        store.dispatch({type: 'SET', state: withLoaded(store.getState(), [inner])})
        const {emissions} = captured(store)

        expect(emissions).toHaveLength(1)
        expect(Object.keys(emissions[0]).sort()).toEqual(['catalogue', 'earthEngineGeneration'])
        // The exact object, not a copy. Nothing reads the catalogue except the shared graph builder, which only
        // reads, so a copy would duplicate an arbitrarily large object for no reader.
        expect(emissions[0].catalogue).toBe(store.getState().process.loadedRecipes)
        expect(JSON.stringify(emissions)).not.toContain('secret-token')
        expect(JSON.stringify(emissions)).not.toContain('accessToken')
    })

    it('publishes nothing for a catalogue-only update', () => {
        const store = storeWith()
        const {emissions} = captured(store)
        store.dispatch({type: 'SET', state: withLoaded(store.getState(), [ccdc()])})

        expect(emissions).toHaveLength(1)
    })

    // Replaced, added and removed are all "the credentials are not the ones this operation started under".
    it.each([
        ['replaced', {accessToken: 'fresh'}],
        ['removed', undefined],
        ['added', {accessToken: 'first'}]
    ])('changes the generation when the credential container is %s', (name, googleTokens) => {
        const store = storeWith()
        if (name === 'added') {
            store.dispatch({type: 'SET', state: {...store.getState(), user: {currentUser: {}}}})
        }
        const {emissions} = captured(store)
        store.dispatch({type: 'SET', state: {...store.getState(), user: {currentUser: {googleTokens}}}})

        expect(emissions).toHaveLength(2)
        expect(emissions[1].earthEngineGeneration).not.toEqual(emissions[0].earthEngineGeneration)
        expect(Object.keys(emissions[1]).sort()).toEqual(['catalogue', 'earthEngineGeneration'])
        expect(JSON.stringify(emissions)).not.toContain('fresh')
        expect(JSON.stringify(emissions)).not.toContain('accessToken')
    })
})

describe('the session a watch reads', () => {
    it('is read without subscribing, with a credential token that changes only with the container', () => {
        const store = storeWith()
        const subscribe = vi.spyOn(store, 'subscribe')
        const {session} = createReduxSourceEnvironment({store})
        const before = session()

        store.dispatch({type: 'SET', state: withLoaded(store.getState(), [ccdc()])})
        const cataloguedOnly = session()
        replaceCredentials(store)
        const replaced = session()

        expect(subscribe).not.toHaveBeenCalled()
        expect(cataloguedOnly.catalogue).toBe(store.getState().process.loadedRecipes)
        expect(cataloguedOnly.credentials).toBe(before.credentials)
        expect(replaced.credentials).not.toBe(before.credentials)
        expect(JSON.stringify([before, cataloguedOnly, replaced])).not.toMatch(/secret-token|fresh|accessToken/)
    })

    it('reports every store change while listened to, and completes when the scope ends', () => {
        const store = storeWith()
        const environment = createReduxSourceEnvironment({store})
        let changes = 0
        let completed = false
        const listening = environment.sessionChanges$.subscribe({next: () => changes++, complete: () => completed = true})

        store.dispatch({type: 'SET', state: withLoaded(store.getState(), [ccdc()])})
        replaceCredentials(store)
        environment.close()

        expect([changes, completed, listening.closed]).toEqual([2, true, true])
    })
})

describe('watching output over the store', () => {
    const MASKED = masking({primary: {type: 'RECIPE_REF', id: 'ccdc-1'}})

    const watchedTwice = () => {
        const store = storeWith()
        const {runtime} = runtimeFor(store)
        store.dispatch({type: 'SET', state: withLoaded(store.getState(), [ccdc(), MASKED])})
        const watches = [0, 1].map(() => runtime.watchOutput$({recipeId: MASKED.id, product: {name: 'IMAGE_OUTPUT'}}).subscribe())
        return {store, runtime, watches}
    }

    it('makes one Earth Engine request for a map layer and Retrieve asking the same question', () => {
        const {store, runtime} = watchedTwice()

        emitBands('RECIPE_REF:ccdc-1', ['tStart', 'ndvi_coefs'])

        expect(state.bandsCalls).toHaveLength(1)
        expect(readOutput(store, runtime, MASKED.id).status).toBe('READY')
    })

    it.each([
        ['an edit', store => store.dispatch({
            type: 'SET',
            state: withLoaded(store.getState(), [ccdc(), {...MASKED, model: {...MASKED.model, imageMask: {type: 'ASSET', id: 'users/x/other'}}}])
        })],
        ['replaced credentials', replaceCredentials]
    ])('withdraws the answer in the dispatch that makes %s, and loads it once again', (_change, change) => {
        const {store, runtime} = watchedTwice()
        emitBands('RECIPE_REF:ccdc-1', ['tStart', 'ndvi_coefs'])

        change(store)

        expect(readOutput(store, runtime, MASKED.id).status).toBe('NEEDS_EVIDENCE')
        expect(state.bandsCalls).toHaveLength(2)
    })

    it('loads an edited question again when a store subscriber ahead of the runtime watches another in that dispatch', () => {
        const store = storeWith()
        const {runtime} = runtimeFor(store)
        const [a, b] = [ccdc('a'), ccdc('b')]
        store.dispatch({type: 'SET', state: withLoaded(store.getState(), [a, b])})
        const editedA = {...a, model: {edited: true}}
        store.subscribe(() => {
            if (store.getState().process.loadedRecipes.a === editedA) {
                runtime.watchOutput$({recipeId: 'b', product: {name: 'IMAGE_OUTPUT'}}).subscribe()
            }
        })
        runtime.watchOutput$({recipeId: 'a', product: {name: 'IMAGE_OUTPUT'}}).subscribe()
        emitBands('RECIPE_REF:a', ['tStart', 'ndvi_coefs'])

        store.dispatch({type: 'SET', state: withLoaded(store.getState(), [editedA, b])})

        expect(state.bandsCalls.map(({recipe}) => recipe.id)).toEqual(['a', 'b', 'a'])
    })
})

describe('the provider', () => {
    const roots = []

    const mount = children => {
        const container = document.createElement('div')
        const root = createRoot(container)
        const store = storeWith()
        roots.push(root)
        act(() => root.render(
            <Provider store={store}>
                <SourceRuntimeProvider>{children}</SourceRuntimeProvider>
            </Provider>
        ))
        return {store, root}
    }

    // Provider teardown is what releases operations and store subscriptions, so a root left mounted leaks one
    // into the next test.
    afterEach(() => {
        roots.splice(0).forEach(root => act(() => root.unmount()))
    })

    it('exposes one referentially stable runtime that a catalogue change does not rerender', () => {
        const renders = []
        const seen = []
        const Consumer = () => {
            const sourceRuntime = useSourceRuntime()
            const count = useRef(0)
            count.current++
            renders.push(count.current)
            seen.push(sourceRuntime)
            return null
        }
        const {store} = mount(<Consumer/>)

        expect(typeof seen[0]?.resolveImageOutput$).toBe('function')
        const rendersBefore = renders.length
        act(() => {
            store.dispatch({type: 'SET', state: withLoaded(store.getState(), [ccdc()])})
        })

        expect(renders.length).toBe(rendersBefore)
        expect(new Set(seen).size).toBe(1)
    })

    it('supplies the same stable service to hooks and class components', () => {
        const seen = []
        const Hooked = () => {
            seen.push(useSourceRuntime())
            return null
        }
        class _Composed extends React.Component {
            render() {
                seen.push(this.props.sourceRuntime)
                return null
            }
        }
        const Composed = withSourceRuntime()(_Composed)
        mount(<><Hooked/><Composed/></>)

        expect(seen).toHaveLength(2)
        expect(typeof seen[0]?.resolveImageOutput$).toBe('function')
        expect(seen[1]).toBe(seen[0])
    })

    it('closes the runtime on unmount, ending detached work', () => {
        let sourceRuntime = null
        const Consumer = () => {
            sourceRuntime = useSourceRuntime()
            return null
        }
        const container = document.createElement('div')
        const root = createRoot(container)
        const store = storeWith()
        act(() => root.render(
            <Provider store={store}>
                <SourceRuntimeProvider><Consumer/></SourceRuntimeProvider>
            </Provider>
        ))
        roots.push(root)
        store.dispatch({type: 'SET', state: withLoaded(store.getState(), [ccdc()])})
        const states = []
        let completed = false
        sourceRuntime?.resolveImageOutput$({recipe: masking({primary: {type: 'RECIPE_REF', id: 'ccdc-1'}})})
            .subscribe({next: published => states.push(published), complete: () => completed = true})
        expect(states.map(({status}) => status)).toEqual(['LOADING'])

        act(() => root.unmount())

        expect(states[states.length - 1]).toEqual({
            status: 'UNAVAILABLE',
            description: null,
            diagnostics: [],
            error: expect.objectContaining({code: 'SOURCE_RUNTIME_UNAVAILABLE'}),
            // The closure had completed; only the observation of its one source was cut short.
            dependencyValidity: {status: 'VALID', diagnostics: []},
            basis: expect.any(Array)
        })
        expect(completed).toBe(true)
        expect(state.torndown).toEqual(['RECIPE_REF:ccdc-1'])

        // A runtime kept past unmount is not a way back in.
        state.bandsCalls = []
        const later = []
        sourceRuntime?.resolveImageOutput$({recipe: ccdc()}).subscribe(published => later.push(published))
        expect(later.map(({status}) => status)).toEqual(['UNAVAILABLE'])
        expect(state.bandsCalls).toEqual([])
    })

    it('stops every output watch on unmount, answering unavailable and loading nothing again', () => {
        let sourceRuntime = null
        const Consumer = () => {
            sourceRuntime = useSourceRuntime()
            return null
        }
        const {store, root} = mount(<Consumer/>)
        const recipe = masking({primary: {type: 'RECIPE_REF', id: 'ccdc-1'}})
        store.dispatch({type: 'SET', state: withLoaded(store.getState(), [ccdc(), recipe])})
        const question = {recipeId: recipe.id, product: {name: 'IMAGE_OUTPUT'}}
        let completed = false
        sourceRuntime.watchOutput$(question).subscribe({complete: () => completed = true})

        act(() => root.unmount())
        let reopened = false
        sourceRuntime.watchOutput$(question).subscribe({complete: () => reopened = true})

        expect([completed, reopened]).toEqual([true, true])
        expect(state.torndown).toEqual(['RECIPE_REF:ccdc-1'])
        expect(state.bandsCalls).toHaveLength(1)
        expect(readOutput(store, sourceRuntime, recipe.id)).toMatchObject({
            status: 'UNAVAILABLE',
            error: expect.objectContaining({code: 'SOURCE_RUNTIME_UNAVAILABLE'})
        })
    })

    it('creates no store subscription merely by existing', () => {
        let sourceRuntime = null
        const Consumer = () => {
            sourceRuntime = useSourceRuntime()
            return null
        }
        const container = document.createElement('div')
        const root = createRoot(container)
        const store = storeWith()
        const subscribe = vi.spyOn(store, 'subscribe')
        act(() => root.render(
            <Provider store={store}>
                <SourceRuntimeProvider><Consumer/></SourceRuntimeProvider>
            </Provider>
        ))
        roots.push(root)
        const providerSubscriptions = subscribe.mock.calls.length

        act(() => {
            store.dispatch({type: 'SET', state: withLoaded(store.getState(), [ccdc()])})
        })
        expect(state.bandsCalls).toEqual([])
        expect(subscribe.mock.calls.length).toBe(providerSubscriptions)

        // Control: a provider that never wires anything up would pass the assertions above.
        expect(typeof sourceRuntime?.resolveImageOutput$).toBe('function')
        sourceRuntime?.resolveImageOutput$({recipe: ccdc()}).subscribe()
        expect(subscribe.mock.calls.length).toBeGreaterThan(providerSubscriptions)
    })
})
