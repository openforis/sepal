import {legacy_createStore as createStore} from 'redux'
import {of} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

// The generic observed-Retrieve orchestrator, driven through the REAL Process source runtime: real shared graph
// construction, registry, CCDC and MASKING declarations, resolver, GUI observer, Redux environment adapter and
// generic task submitter. Only the Earth Engine bands API, task submission, notifications, logging, task info,
// visualizations, analytics and translation are replaced.
//
// Nothing is rendered. Statuses, diagnostic codes and policies are written as literals.

const state = vi.hoisted(() => ({
    bandsCalls: [],
    subscribers: new Map(),
    recipeCalls: [],
    recipeSubscribers: new Map(),
    recipeTorndown: [],
    submitted: [],
    events: [],
    notifications: [],
    logged: []
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
                        return () => undefined
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
            },
            tasks: {
                submit$: task => {
                    state.submitted.push(task)
                    return {subscribe: () => ({unsubscribe: () => {}})}
                }
            }
        }
    }
})

vi.mock('~/widget/notifications', () => ({
    Notifications: {error: notification => state.notifications.push(notification)}
}))

vi.mock('~/log', () => ({
    getLogger: () => ({
        error: (...args) => state.logged.push(args),
        warn: () => {}, info: () => {}, debug: () => {}, trace: () => {}
    })
}))

vi.mock('~/app/home/body/process/recipe/recipeOutputPath', () => ({
    getTaskInfo: ({retrieveOptions}) => ({retrieveOptions})
}))

vi.mock('~/app/home/body/process/recipe/visualizations', () => ({
    getAllVisualizations: () => []
}))

vi.mock('~/app/home/body/process/recipeTypeRegistry', () => ({
    getRecipeType: () => ({id: 'MASKING'})
}))

vi.mock('~/eventPublisher', () => ({
    publishEvent: (event, props) => state.events.push({event, props})
}))

vi.mock('~/translate', () => ({
    msg: key => (Array.isArray(key) ? key.join('.') : key)
}))

// The consumer path must never reach the ambient store.
vi.mock('~/store', () => ({
    select: () => {
        throw new Error('observed Retrieve must not use the singleton select()')
    },
    subscribe: () => {
        throw new Error('observed Retrieve must not use the singleton subscribe()')
    }
}))

const {submitObservedRetrieve} = await import('./observedRetrieve')
const {createReduxSourceEnvironment} = await import('../sourceRuntime/reduxSourceEnvironment')
const {createSourceRuntime} = await import('../sourceRuntime/sourceRuntime')

beforeEach(() => {
    state.bandsCalls = []
    state.subscribers = new Map()
    state.recipeCalls = []
    state.recipeSubscribers = new Map()
    state.recipeTorndown = []
    state.submitted = []
    state.events = []
    state.notifications = []
    state.logged = []
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

const masking = ({id = 'masked-1', primary, mask = {type: 'ASSET', id: 'users/x/mask'}}) => ({
    id,
    projectId: 'project-1',
    type: 'MASKING',
    title: 'A masked recipe',
    model: {imageToMask: primary, imageMask: mask},
    ui: {retrieveOptions: {destination: 'GEE', bands: ['stale-band']}}
})

const recipeRef = id => ({type: 'RECIPE_REF', id})
const assetRef = id => ({type: 'ASSET', id})

const remapping = (id, sourceId) => ({
    id,
    type: 'REMAPPING',
    model: {
        inputImagery: {
            images: [{imageId: `${id}-image`, type: 'RECIPE_REF', id: sourceId}]
        }
    }
})

const reducer = (current = {process: {loadedRecipes: {}}, user: {currentUser: {googleTokens: {}}}}, action) =>
    action.state ? action.state : current

const runtimeWith = recipes => {
    const store = createStore(reducer)
    store.dispatch({
        type: 'SET',
        state: {
            ...store.getState(),
            process: {loadedRecipes: Object.fromEntries(recipes.map(recipe => [recipe.id, recipe]))}
        }
    })
    const environment = createReduxSourceEnvironment({store})
    return {store, environment, ...createSourceRuntime({environment$: environment.environment$})}
}

// Masking's legacy policy: only `change` gets `mode`, everything else `mean` - which is what breaks a masked
// CCDC's array bands, and why it may only ever be a fallback.
const LEGACY = bands => Object.fromEntries(bands.map(name => [name, name === 'change' ? 'mode' : 'mean']))

const OPTIONS = {destination: 'GEE', bands: ['tStart', 'ndvi_coefs']}
const arrayBands = names => names.map((name, index) => ({name, arrayDimensions: index % 2 + 1}))

// Tolerant of an empty submission so a missing task fails as a diff rather than a TypeError.
const taskOf = tasks => tasks[0] || {params: {}}
const imageOf = tasks => taskOf(tasks).params.image || {}

const submit = ({recipe, resolveImageOutput$, retrieveOptions = OPTIONS, ...rest}) =>
    submitObservedRetrieve({recipe, retrieveOptions, resolveImageOutput$, ...rest})

describe('resolved submission', () => {
    const maskedCcdc = (options = {}) => {
        const inner = ccdc()
        const recipe = masking({primary: recipeRef('ccdc-1')})
        const {resolveImageOutput$} = runtimeWith([recipe, inner])
        return {recipe, inner, resolveImageOutput$, ...options}
    }

    it('observes the loaded CCDC exactly once and never the mask', () => {
        const {recipe, inner, resolveImageOutput$} = maskedCcdc()
        submit({recipe, resolveImageOutput$})

        expect(state.bandsCalls).toEqual([{recipe: inner, includeDataTypes: true}])
    })

    it('submits nothing while the observation is in flight', () => {
        const {recipe, resolveImageOutput$} = maskedCcdc()
        submit({recipe, resolveImageOutput$})

        expect(state.submitted).toEqual([])
        expect(state.events).toEqual([])

        emit('RECIPE_REF:ccdc-1', arrayBands(['tStart', 'ndvi_coefs']))
        expect(state.submitted).toHaveLength(1)
        expect(state.events).toHaveLength(1)
    })

    it('gives every selected CCDC band sample, under the outer Masking recipe', () => {
        const {recipe, resolveImageOutput$} = maskedCcdc()
        submit({recipe, resolveImageOutput$, fallbackPyramidingPolicy: LEGACY})
        emit('RECIPE_REF:ccdc-1', arrayBands(['tStart', 'ndvi_coefs', 'ndvi_rmse']))

        expect(imageOf(state.submitted).pyramidingPolicy).toEqual({tStart: 'sample', ndvi_coefs: 'sample'})
        expect(imageOf(state.submitted).recipe.id).toBe('masked-1')
        expect(imageOf(state.submitted).recipe.type).toBe('MASKING')
        expect(state.notifications).toEqual([])
    })

    // Preservation is transitive and needs no knowledge of what is being preserved.
    it('preserves sample through Masking over Masking over CCDC, observing CCDC once', () => {
        const inner = ccdc()
        const middle = masking({id: 'masked-inner', primary: recipeRef('ccdc-1')})
        const recipe = masking({id: 'masked-1', primary: recipeRef('masked-inner')})
        const {resolveImageOutput$} = runtimeWith([recipe, middle, inner])
        submit({recipe, resolveImageOutput$})
        emit('RECIPE_REF:ccdc-1', arrayBands(['tStart', 'ndvi_coefs']))

        expect(state.bandsCalls).toEqual([{recipe: inner, includeDataTypes: true}])
        expect(imageOf(state.submitted).pyramidingPolicy).toEqual({tStart: 'sample', ndvi_coefs: 'sample'})
    })

    it.each([
        ['an empty selection', []],
        ['an absent selection', undefined]
    ])('describes every band for %s', (_name, bands) => {
        const {recipe, resolveImageOutput$} = maskedCcdc()
        submit({recipe, resolveImageOutput$, retrieveOptions: {destination: 'GEE', bands}})
        emit('RECIPE_REF:ccdc-1', arrayBands(['tStart', 'ndvi_coefs']))

        expect(imageOf(state.submitted).pyramidingPolicy).toEqual({tStart: 'sample', ndvi_coefs: 'sample'})
        expect(imageOf(state.submitted).bands).toEqual({selection: bands})
    })

    it('keeps unrelated task configuration on the resolved path', () => {
        const {recipe, resolveImageOutput$} = maskedCcdc()
        submit({recipe, resolveImageOutput$, taskConfig: {dataSetType: 'OPTICAL'}})
        emit('RECIPE_REF:ccdc-1', arrayBands(['tStart', 'ndvi_coefs']))

        expect(state.events).toEqual([{
            event: 'submit_task',
            props: {recipe_type: 'MASKING', destination: 'GEE', data_set_type: 'OPTICAL'}
        }])
    })
})

describe('resolved array-valued asset submission', () => {
    it('observes only the primary asset and submits sample under the outer Masking recipe', () => {
        const mask = ccdc('mask-1')
        const recipe = masking({
            primary: assetRef('users/x/ccdc-segments'),
            mask: recipeRef('mask-1')
        })
        const {resolveImageOutput$} = runtimeWith([recipe, mask])
        const fallbackPyramidingPolicy = vi.fn(LEGACY)

        submit({recipe, resolveImageOutput$, fallbackPyramidingPolicy})

        expect.soft(state.bandsCalls).toEqual([{
            asset: 'users/x/ccdc-segments',
            includeDataTypes: true
        }])
        expect(state.submitted).toEqual([])

        emit('ASSET:users/x/ccdc-segments', [
            {name: 'tStart', arrayDimensions: 1},
            {name: 'ndvi_coefs', arrayDimensions: 2},
            {name: 'future_array', arrayDimensions: 1}
        ])

        expect.soft(state.bandsCalls).toHaveLength(1)
        expect.soft(imageOf(state.submitted).recipe).toMatchObject({id: 'masked-1', type: 'MASKING'})
        expect.soft(imageOf(state.submitted).pyramidingPolicy).toEqual({
            tStart: 'sample',
            ndvi_coefs: 'sample'
        })
        expect.soft(fallbackPyramidingPolicy).not.toHaveBeenCalled()
        expect.soft(state.notifications).toEqual([])
    })
})

describe('resolved scalar asset migration compatibility', () => {
    it('fills missing scalar policies from Masking fallback for Earth Engine', () => {
        const recipe = masking({primary: assetRef('users/x/scalar')})
        const {resolveImageOutput$} = runtimeWith([recipe])
        const fallbackPyramidingPolicy = vi.fn(LEGACY)

        submit({recipe, resolveImageOutput$, fallbackPyramidingPolicy})
        emit('ASSET:users/x/scalar', [
            {name: 'tStart', arrayDimensions: 0},
            {name: 'ndvi_coefs', arrayDimensions: 0}
        ])

        expect(imageOf(state.submitted).pyramidingPolicy).toEqual({tStart: 'mean', ndvi_coefs: 'mean'})
        expect(fallbackPyramidingPolicy).toHaveBeenCalledWith(['tStart', 'ndvi_coefs'])
        expect(state.notifications).toEqual([])
    })
})

describe('mixed asset selection and destination validation', () => {
    const start = ({destination, bands}) => {
        const recipe = masking({primary: assetRef('users/x/mixed')})
        const {resolveImageOutput$} = runtimeWith([recipe])
        const fallbackPyramidingPolicy = vi.fn(LEGACY)
        submit({
            recipe,
            resolveImageOutput$,
            retrieveOptions: {destination, bands},
            fallbackPyramidingPolicy
        })
        emit('ASSET:users/x/mixed', [
            {name: 'array', arrayDimensions: 1},
            {name: 'scalar', arrayDimensions: 0}
        ])
        return {fallbackPyramidingPolicy}
    }

    it('submits a selected array subset to Earth Engine under sample', () => {
        const {fallbackPyramidingPolicy} = start({destination: 'GEE', bands: ['array']})

        expect(imageOf(state.submitted).pyramidingPolicy).toEqual({array: 'sample'})
        expect(imageOf(state.submitted).bands).toEqual({selection: ['array']})
        expect(fallbackPyramidingPolicy).not.toHaveBeenCalled()
        expect(state.notifications).toEqual([])
    })

    it('fills a selected scalar policy from Masking migration fallback for Earth Engine', () => {
        const {fallbackPyramidingPolicy} = start({destination: 'GEE', bands: ['scalar']})

        expect(imageOf(state.submitted).pyramidingPolicy).toEqual({scalar: 'mean'})
        expect(fallbackPyramidingPolicy).toHaveBeenCalledWith(['scalar'])
        expect(state.notifications).toEqual([])
    })

    it.each([
        ['an explicit all-band selection', []],
        ['an absent band selection', undefined]
    ])('keeps array sample and fills scalar policy for %s', (_name, bands) => {
        const {fallbackPyramidingPolicy} = start({destination: 'GEE', bands})

        expect(imageOf(state.submitted).pyramidingPolicy).toEqual({array: 'sample', scalar: 'mean'})
        expect(fallbackPyramidingPolicy).toHaveBeenCalledWith(['scalar'])
        expect(state.notifications).toEqual([])
    })

    it.each(['DRIVE', 'SEPAL'])('submits a selected scalar subset to %s without a policy', destination => {
        const {fallbackPyramidingPolicy} = start({destination, bands: ['scalar']})

        expect(state.submitted).toHaveLength(1)
        expect(imageOf(state.submitted)).not.toHaveProperty('pyramidingPolicy')
        expect(fallbackPyramidingPolicy).not.toHaveBeenCalled()
        expect(state.notifications).toEqual([])
    })

    it.each(['DRIVE', 'SEPAL'])('blocks a selected array subset for the %s scalar renderer', destination => {
        const {fallbackPyramidingPolicy} = start({destination, bands: ['array']})

        expect(state.submitted).toEqual([])
        expect(fallbackPyramidingPolicy).not.toHaveBeenCalled()
        expect(state.notifications).toEqual([{message: 'process.retrieve.error.imageOutput'}])
    })
})

describe('exact snapshots', () => {
    // The recipe being edited carries unsaved changes; the catalogue holds what was last committed to it.
    it('resolves the passed recipe, not an older catalogue record with the same id', () => {
        const inner = ccdc()
        const stale = masking({id: 'masked-1', primary: recipeRef('gone')})
        const current = masking({id: 'masked-1', primary: recipeRef('ccdc-1')})
        const {resolveImageOutput$} = runtimeWith([stale, inner])
        submit({recipe: current, resolveImageOutput$})

        expect(state.bandsCalls).toEqual([{recipe: inner, includeDataTypes: true}])
    })

    it('submits the explicit options even when the stored ones are stale', () => {
        const inner = ccdc()
        const recipe = masking({primary: recipeRef('ccdc-1')})
        const {resolveImageOutput$} = runtimeWith([recipe, inner])
        submit({recipe, resolveImageOutput$, retrieveOptions: {destination: 'GEE', bands: ['tStart'], scale: 30}})
        emit('RECIPE_REF:ccdc-1', arrayBands(['tStart']))

        const task = taskOf(state.submitted)
        expect(task.operation).toBe('image.GEE')
        expect(imageOf(state.submitted).bands).toEqual({selection: ['tStart']})
        expect(imageOf(state.submitted).scale).toBe(30)
        expect(task.params.taskInfo).toEqual({retrieveOptions: {destination: 'GEE', bands: ['tStart'], scale: 30}})
        expect(JSON.stringify(task)).not.toContain('stale-band')
    })
})

describe('the coexistence fallback', () => {
    const undeclared = () => {
        const inner = {id: 'mosaic-1', type: 'MOSAIC', model: {}}
        const recipe = masking({primary: recipeRef('mosaic-1')})
        const {resolveImageOutput$} = runtimeWith([recipe, inner])
        return {recipe, resolveImageOutput$}
    }

    // A registered type that has not joined output declarations keeps its previous behavior exactly. This is
    // legacy behavior, not resolved evidence.
    it('uses the explicit legacy policy for an undeclared recipe type, observing nothing', () => {
        const {recipe, resolveImageOutput$} = undeclared()
        submit({recipe, resolveImageOutput$, fallbackPyramidingPolicy: LEGACY})

        expect(state.bandsCalls).toEqual([])
        expect(imageOf(state.submitted).pyramidingPolicy).toEqual({tStart: 'mean', ndvi_coefs: 'mean'})
    })

    it('keeps unrelated task configuration on the fallback path', () => {
        const {recipe, resolveImageOutput$} = undeclared()
        submit({recipe, resolveImageOutput$, fallbackPyramidingPolicy: LEGACY, taskConfig: {dataSetType: 'OPTICAL'}})

        expect(state.events).toEqual([{
            event: 'submit_task',
            props: {recipe_type: 'MASKING', destination: 'GEE', data_set_type: 'OPTICAL'}
        }])
    })

    it('blocks an undeclared type when no fallback policy was supplied', () => {
        const {recipe, resolveImageOutput$} = undeclared()
        submit({recipe, resolveImageOutput$})

        expect(state.submitted).toEqual([])
        expect(state.notifications).toEqual([{message: 'process.retrieve.error.imageOutput'}])
    })

    it('does not fall back from a terminal envelope without diagnostics', () => {
        const recipe = masking({primary: recipeRef('ccdc-1')})
        const resolveImageOutput$ = () => of({
            status: 'INVALID',
            description: null,
            diagnostics: [],
            error: null
        })

        submit({recipe, resolveImageOutput$, fallbackPyramidingPolicy: LEGACY})

        expect(state.submitted).toEqual([])
        expect(state.notifications).toEqual([{message: 'process.retrieve.error.imageOutput'}])
    })

    it('does not fall back when UNDECLARED_OUTPUT is mixed with another diagnostic', () => {
        const recipe = masking({primary: recipeRef('ccdc-1')})
        const resolveImageOutput$ = () => of({
            status: 'INVALID',
            description: null,
            diagnostics: [
                {code: 'UNDECLARED_OUTPUT'},
                {code: 'MISSING_SOURCE'}
            ],
            error: null
        })

        submit({recipe, resolveImageOutput$, fallbackPyramidingPolicy: LEGACY})

        expect(state.submitted).toEqual([])
        expect(state.events).toEqual([])
        expect(state.notifications).toEqual([{message: 'process.retrieve.error.imageOutput'}])
    })
})

describe('fallback authority validation', () => {
    const undeclaredOutput = {
        status: 'INVALID',
        description: null,
        diagnostics: [{code: 'UNDECLARED_OUTPUT'}],
        error: null
    }

    it.each([
        ['null', null],
        ['false', false],
        ['a string', 'sample'],
        ['an array', ['sample']]
    ])('rejects %s before resolving output', (_name, fallbackPyramidingPolicy) => {
        const recipe = masking({primary: recipeRef('mosaic-1')})
        const resolveImageOutput$ = vi.fn(() => of(undeclaredOutput))
        let error

        try {
            submit({recipe, resolveImageOutput$, fallbackPyramidingPolicy})
        } catch (caught) {
            error = caught
        }

        expect.soft(resolveImageOutput$).not.toHaveBeenCalled()
        expect.soft(state.submitted).toEqual([])
        expect.soft(state.events).toEqual([])
        expect.soft(state.notifications).toEqual([])
        expect.soft(error).toBeInstanceOf(Error)
        expect(error?.message || '').toMatch(/fallback|policy/i)
    })

    it('accepts an object policy as explicit fallback authority', () => {
        const recipe = masking({primary: recipeRef('mosaic-1')})
        const fallbackPyramidingPolicy = {'.default': 'sample'}
        const resolveImageOutput$ = vi.fn(() => of(undeclaredOutput))

        submit({recipe, resolveImageOutput$, fallbackPyramidingPolicy})

        expect(resolveImageOutput$).toHaveBeenCalledOnce()
        expect(resolveImageOutput$).toHaveBeenCalledWith({recipe})
        expect(imageOf(state.submitted).pyramidingPolicy).toBe(fallbackPyramidingPolicy)
        expect(state.events).toHaveLength(1)
        expect(state.notifications).toEqual([])
    })
})

describe('operation lifecycle', () => {
    it('returns an RxJS subscription owned by the caller', () => {
        const recipe = masking({primary: recipeRef('ccdc-1')})
        const operation = submit({recipe, resolveImageOutput$: () => of({status: 'LOADING'})})

        expect(operation).toBeDefined()
        expect(operation.unsubscribe).toBeTypeOf('function')
        operation.unsubscribe()
    })
})

describe('session catalogue dependency boundary', () => {
    const expectDependencyLoadBlock = (fallbackPyramidingPolicy, failure) => {
        expect(state.bandsCalls).toEqual([])
        expect(state.submitted).toEqual([])
        expect(state.events).toEqual([])
        expect(state.notifications).toEqual([{message: 'notifications.error.generic'}])
        expect(state.logged.flat()).toContain(failure)
        expect(fallbackPyramidingPolicy).not.toHaveBeenCalled()
    }

    it('blocks safely when a direct missing dependency is not found by authenticated loading', () => {
        const recipe = masking({
            primary: assetRef('users/x/primary'),
            mask: recipeRef('mask-absent')
        })
        const {resolveImageOutput$} = runtimeWith([recipe])
        const fallbackPyramidingPolicy = vi.fn(LEGACY)

        submit({recipe, resolveImageOutput$, fallbackPyramidingPolicy})

        expect(state.recipeCalls).toEqual(['mask-absent'])
        const failure = Object.assign(new Error('recipe not found'), {status: 404})
        failRecipe('mask-absent', failure)

        expectDependencyLoadBlock(fallbackPyramidingPolicy, failure)
    })

    it('loads the real Masking asset-primary and REMAPPING-mask closure before successful submission', () => {
        const mask = remapping('mask-1', 'nested-1')
        const recipe = masking({
            primary: assetRef('users/x/ccdc-segments'),
            mask: recipeRef('mask-1')
        })
        const {resolveImageOutput$, store} = runtimeWith([recipe, mask])
        const fallbackPyramidingPolicy = vi.fn(LEGACY)
        const retrieveOptions = {destination: 'GEE', bands: ['tStart', 'ndvi_coefs']}

        submit({recipe, resolveImageOutput$, fallbackPyramidingPolicy, retrieveOptions})

        expect(state.recipeCalls).toEqual(['nested-1'])
        expect(state.bandsCalls).toEqual([])
        emitRecipe('nested-1', ccdc('nested-1'))
        expect(state.bandsCalls).toEqual([{
            asset: 'users/x/ccdc-segments',
            includeDataTypes: true
        }])
        emit('ASSET:users/x/ccdc-segments', arrayBands(['tStart', 'ndvi_coefs']))

        expect(imageOf(state.submitted).recipe).toMatchObject({id: 'masked-1', type: 'MASKING'})
        expect(imageOf(state.submitted).pyramidingPolicy).toEqual({
            tStart: 'sample',
            ndvi_coefs: 'sample'
        })
        expect(fallbackPyramidingPolicy).not.toHaveBeenCalled()
        expect(store.getState().process.loadedRecipes).not.toHaveProperty('nested-1')
        expect(state.bandsCalls).toHaveLength(1)
    })

    it('retries with a new cold resolution after the missing dependency enters Redux', () => {
        const nested = ccdc('nested-1')
        const mask = masking({id: 'mask-1', primary: recipeRef('nested-1')})
        const recipe = masking({
            primary: assetRef('users/x/primary'),
            mask: recipeRef('mask-1')
        })
        const {resolveImageOutput$, store} = runtimeWith([recipe, mask])
        const resolve = vi.fn(args => resolveImageOutput$(args))
        const fallbackPyramidingPolicy = vi.fn(LEGACY)
        const retrieveOptions = {destination: 'GEE', bands: ['array']}

        submit({recipe, resolveImageOutput$: resolve, fallbackPyramidingPolicy, retrieveOptions})
        expect(state.recipeCalls).toEqual(['nested-1'])
        const failure = Object.assign(new Error('temporarily forbidden'), {status: 403})
        failRecipe('nested-1', failure)
        expectDependencyLoadBlock(fallbackPyramidingPolicy, failure)

        const current = store.getState()
        store.dispatch({
            type: 'SET',
            state: {
                ...current,
                process: {
                    ...current.process,
                    loadedRecipes: {...current.process.loadedRecipes, [nested.id]: nested}
                }
            }
        })
        state.notifications = []
        state.logged = []

        submit({recipe, resolveImageOutput$: resolve, fallbackPyramidingPolicy, retrieveOptions})

        expect(resolve).toHaveBeenCalledTimes(2)
        expect(state.recipeCalls).toEqual(['nested-1'])
        expect(state.bandsCalls).toEqual([{
            asset: 'users/x/primary',
            includeDataTypes: true
        }])
        emit('ASSET:users/x/primary', [{name: 'array', arrayDimensions: 1}])
        expect(imageOf(state.submitted).pyramidingPolicy).toEqual({array: 'sample'})
        expect(fallbackPyramidingPolicy).not.toHaveBeenCalled()
        expect(state.notifications).toEqual([])
    })
})

describe('blocked submissions', () => {
    const expectBlocked = message => {
        expect(state.submitted).toEqual([])
        expect(state.events).toEqual([])
        expect(state.notifications).toEqual([{message}])
    }

    // The absent recipe could be CCDC. Applying Masking's legacy `mean` would reproduce the exact defect this
    // migration exists to fix, so a dependency the authenticated endpoint cannot provide must block.
    it('blocks a dependency missing from both the session and authenticated storage', () => {
        const recipe = masking({primary: recipeRef('ccdc-absent')})
        const {resolveImageOutput$} = runtimeWith([recipe])
        submit({recipe, resolveImageOutput$, fallbackPyramidingPolicy: LEGACY})

        expect(state.recipeCalls).toEqual(['ccdc-absent'])
        const failure = Object.assign(new Error('recipe not found'), {status: 404})
        failRecipe('ccdc-absent', failure)

        expect(state.bandsCalls).toEqual([])
        expectBlocked('notifications.error.generic')
        expect(state.logged.flat()).toContain(failure)
    })

    it('blocks a direct scalar asset whose export policy is unknown when no migration fallback is supplied', () => {
        const recipe = masking({primary: assetRef('users/x/primary')})
        const {resolveImageOutput$} = runtimeWith([recipe])
        submit({recipe, resolveImageOutput$})
        expect.soft(state.bandsCalls).toEqual([{
            asset: 'users/x/primary',
            includeDataTypes: true
        }])
        emit('ASSET:users/x/primary', [
            {name: 'tStart', arrayDimensions: 0},
            {name: 'ndvi_coefs', arrayDimensions: 0}
        ])

        expectBlocked('process.retrieve.error.imageOutput')
    })

    it('blocks a malformed asset output', () => {
        const recipe = masking({primary: assetRef('users/x/primary')})
        const {resolveImageOutput$} = runtimeWith([recipe])
        submit({recipe, resolveImageOutput$, fallbackPyramidingPolicy: LEGACY})
        emit('ASSET:users/x/primary', [
            {name: 'tStart', arrayDimensions: 1},
            {name: 'tStart', arrayDimensions: 1}
        ])

        expectBlocked('process.retrieve.error.imageOutput')
        expect(JSON.stringify(state.notifications)).not.toContain('DUPLICATE_BAND_NAME')
    })

    it('blocks a cyclic dependency', () => {
        const recipe = masking({primary: recipeRef('masked-1')})
        const {resolveImageOutput$} = runtimeWith([recipe])
        submit({recipe, resolveImageOutput$, fallbackPyramidingPolicy: LEGACY})

        expect(state.bandsCalls).toEqual([])
        expectBlocked('process.retrieve.error.imageOutput')
        expect(JSON.stringify(state.notifications)).not.toContain('CYCLIC_DEPENDENCY')
    })

    // Masking's selection comes from a band snapshot copied when the source was chosen, so a selection the
    // current output no longer describes is ordinary. The rejection must not escape the RxJS callback.
    it('blocks a selected band the resolved output does not describe', () => {
        const inner = ccdc()
        const recipe = masking({primary: recipeRef('ccdc-1')})
        const {resolveImageOutput$} = runtimeWith([recipe, inner])
        submit({recipe, resolveImageOutput$, retrieveOptions: {destination: 'GEE', bands: ['tStart', 'gone']}})

        expect(() => emit('RECIPE_REF:ccdc-1', arrayBands(['tStart']))).not.toThrow()
        expectBlocked('process.retrieve.error.imageOutput')
        expect(state.logged.flat().some(entry => entry instanceof Error && /gone/.test(entry.message))).toBe(true)
    })

    it.each([
        ['a service fault', 500, 'notifications.error.generic'],
        ['an unreachable gateway', 502, 'notifications.error.connectionError']
    ])('blocks %s with its safe message, logging the original', (_name, status, message) => {
        const inner = ccdc()
        const recipe = masking({primary: recipeRef('ccdc-1')})
        const {resolveImageOutput$} = runtimeWith([recipe, inner])
        const failure = new Error('ajax error')
        failure.status = status
        failure.response = {body: 'stack trace and secrets'}
        submit({recipe, resolveImageOutput$, fallbackPyramidingPolicy: LEGACY})
        fail('RECIPE_REF:ccdc-1', failure)

        expectBlocked(message)
        expect(JSON.stringify(state.notifications)).not.toContain('ajax error')
        expect(JSON.stringify(state.notifications)).not.toContain('secrets')
        expect(state.notifications[0]).not.toHaveProperty('error')
        expect(state.logged.flat()).toContain(failure)
    })

    it('cannot fall back when the runtime scope closes', () => {
        const inner = ccdc()
        const recipe = masking({primary: recipeRef('ccdc-1')})
        const {resolveImageOutput$, environment} = runtimeWith([recipe, inner])
        submit({recipe, resolveImageOutput$, fallbackPyramidingPolicy: LEGACY})
        environment.close()

        expect(state.submitted).toEqual([])
        expect(state.notifications).toHaveLength(1)
    })

    it('cannot fall back when the credential container is replaced', () => {
        const inner = ccdc()
        const recipe = masking({primary: recipeRef('ccdc-1')})
        const {resolveImageOutput$, store} = runtimeWith([recipe, inner])
        submit({recipe, resolveImageOutput$, fallbackPyramidingPolicy: LEGACY})
        store.dispatch({
            type: 'SET',
            state: {...store.getState(), user: {currentUser: {googleTokens: {accessToken: 'fresh'}}}}
        })

        expect(state.submitted).toEqual([])
        expect(state.notifications).toHaveLength(1)
        expect(JSON.stringify(state.notifications)).not.toContain('fresh')
    })

    it('cancels dependency loading and cannot fall back when the runtime scope closes', () => {
        const recipe = masking({primary: recipeRef('nested-1')})
        const {resolveImageOutput$, environment} = runtimeWith([recipe])

        submit({recipe, resolveImageOutput$, fallbackPyramidingPolicy: LEGACY})
        expect(state.recipeCalls).toEqual(['nested-1'])
        environment.close()

        expect(state.recipeTorndown).toEqual(['nested-1'])
        expect(state.submitted).toEqual([])
        expect(state.events).toEqual([])
        expect(state.notifications).toHaveLength(1)
    })

    it('cancels dependency loading and cannot fall back when credentials change', () => {
        const recipe = masking({primary: recipeRef('nested-1')})
        const {resolveImageOutput$, store} = runtimeWith([recipe])

        submit({recipe, resolveImageOutput$, fallbackPyramidingPolicy: LEGACY})
        expect(state.recipeCalls).toEqual(['nested-1'])
        store.dispatch({
            type: 'SET',
            state: {...store.getState(), user: {currentUser: {googleTokens: {accessToken: 'new'}}}}
        })

        expect(state.recipeTorndown).toEqual(['nested-1'])
        expect(state.submitted).toEqual([])
        expect(state.events).toEqual([])
        expect(state.notifications).toHaveLength(1)
        expect(JSON.stringify(state.notifications)).not.toContain('new')
    })

    // The committed runtime promises never to use the error channel; the orchestrator must survive one anyway.
    it('handles an unexpected Observable error channel through the safe transport path', async () => {
        const {throwError} = await import('rxjs')
        const failure = new Error('unexpected')
        failure.status = 500
        const recipe = masking({primary: recipeRef('ccdc-1')})
        submit({recipe, resolveImageOutput$: () => throwError(() => failure), fallbackPyramidingPolicy: LEGACY})

        expectBlocked('notifications.error.generic')
    })
})

describe('output authority validation', () => {
    it.each([
        ['pyramidingPolicy', {pyramidingPolicy: {'.default': 'sample'}}],
        ['imageOutputDescription', {imageOutputDescription: {}}],
        ['fallbackPyramidingPolicy', {fallbackPyramidingPolicy: {'.default': 'mean'}}],
        ['customizeImage', {customizeImage: image => image}]
    ])('rejects %s in taskConfig before any resolution', (_name, taskConfig) => {
        const inner = ccdc()
        const recipe = masking({primary: recipeRef('ccdc-1')})
        const {resolveImageOutput$} = runtimeWith([recipe, inner])

        expect(() => submit({recipe, resolveImageOutput$, taskConfig})).toThrow()
        expect(state.bandsCalls).toEqual([])
        expect(state.submitted).toEqual([])
    })
})
