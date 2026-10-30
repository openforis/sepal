import _ from 'lodash'
import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

// A Change Alerts layer showing the mosaic a period is compared on, over a CCDC the session does not hold. What it
// needs is acquired through the real lifecycle: the source runtime the provider builds over a real store observes the
// reference - reading the CCDC's record for the processing the mosaic is built with (referenceObservation.js) - and
// completes the dependencies, and the layer is given the props its own selector computes from both. Only storage,
// Earth Engine and the drawn preview are substituted. As in recipeImageLayer.test.js nothing renders the layer: the
// map's request for it is maybeCreateLayer, and its lifecycle is called as React would call it.

const fake = vi.hoisted(() => ({loads: [], geeReads: [], constructed: [], selectors: [], listing: []}))

vi.mock('~/compose', () => ({
    compose: Component => Component,
    composeHoC: () => Component => Component
}))
// The selectors connected components are given, so the layer's own can be applied to the real store as React Redux
// applies it.
vi.mock('~/connect', () => ({
    connect: mapStateToProps => {
        fake.selectors.push(mapStateToProps)
        return Component => Component
    }
}))
vi.mock('~/app/home/map/layer/earthEngineImageLayer', () => ({
    EarthEngineImageLayer: class {
        constructor(args) {
            fake.constructed.push(args)
            this.watchedProps = args.watchedProps
        }

        removeFromMap() {}
    }
}))
vi.mock('~/translate', () => ({msg: key => (Array.isArray(key) ? key.join('.') : key)}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
// Storage answers each read when the test says so; Earth Engine is recorded and never answers, for nothing here may
// need it.
vi.mock('~/apiRegistry', async () => {
    const {Observable, of, throwError} = await import('rxjs')
    return {default: {
        recipe: {
            load$: id => new Observable(subscriber => {
                const load = {id, subscriber, torndown: false}
                fake.loads.push(load)
                return () => load.torndown = true
            }),
            loadAll$: () => of(fake.listing),
            // A save is acknowledged with the next revision, as storage acknowledges it.
            save$: ({expectedRevision}) => of({revision: (expectedRevision ?? 0) + 1})
        },
        gee: new Proxy({}, {
            get: (_target, name) => args => {
                fake.geeReads.push([name, args])
                return throwError(() => new Error(`Earth Engine is not asked here: ${name}`))
            }
        })
    }}
})

// The layer's selector is the last connected while its module loads: a module's body runs after its imports'.
const {RecipeImageLayer} = await import('../recipeImageLayer')
const layerSelector = fake.selectors.at(-1)
const {addRecipeType} = await import('../../recipeTypeRegistry')
const {default: changeAlertsType} = await import('./changeAlerts')
const {default: ccdcType} = await import('../ccdc/ccdc')
const {SourceRuntimeProvider, withSourceRuntime} = await import('../../sourceRuntime/sourceRuntimeContext')
const {initStore} = await import('~/store')

addRecipeType(changeAlertsType())
addRecipeType(ccdcType())

globalThis.IS_REACT_ACT_ENVIRONMENT = true

beforeEach(() => {
    fake.loads = []
    fake.geeReads = []
    fake.constructed = []
    fake.listing = LISTING
})

let root

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
})

describe('a Change Alerts collection mosaic whose CCDC the session does not hold', () => {
    const RGB = {id: 'rgb', type: 'rgb', bands: ['red', 'green', 'blue'], min: [0, 0, 0], max: [2000, 2000, 2000]}
    const view = (period, mosaicType, visParams = RGB) => ({visualizationType: period, mosaicType, visParams})

    it('reads only the CCDC\'s record, then requests its preview with the arguments its editor reads it by', async () => {
        const shown = await show({layerConfig: view('monitoring', 'latest')})
        expect(shown.layer()).toBe(null)
        expect(readIds()).toEqual([CCDC.id])

        await shown.answer(CCDC)

        expect(shown.layer()).not.toBe(null)
        expect(fake.constructed[0].previewRequest).toEqual({
            recipe: _.omit(shown.recipe(), ['ui', 'layers']),
            visualizationType: 'monitoring',
            mosaicType: 'latest',
            visParams: RGB
        })
        expect(fake.geeReads).toEqual([])
    })

    it('requests the same preview shown in another recipe\'s map, the recipe it shows not open', async () => {
        const shown = await show({layerConfig: view('monitoring', 'latest'), inAnotherRecipe: true})

        await shown.answer(CCDC)

        expect(shown.layer()).not.toBe(null)
        expect(fake.constructed[0].previewRequest).toMatchObject({
            recipe: _.omit(shown.recipe(), ['ui', 'layers']),
            visualizationType: 'monitoring',
            mosaicType: 'latest'
        })
    })

    it('rebuilds the preview for another period and mosaic type, reusing what it acquired', async () => {
        const shown = await show({layerConfig: view('monitoring', 'latest')})
        await shown.answer(CCDC)
        shown.layer()

        await shown.setLayerConfig(view('calibration', 'median'))

        expect(shown.layer()).not.toBe(null)
        expect(shown.newReads()).toEqual([])
        expect(fake.constructed.map(({previewRequest: {visualizationType, mosaicType}}) => ({visualizationType, mosaicType})))
            .toEqual([{visualizationType: 'monitoring', mosaicType: 'latest'}, {visualizationType: 'calibration', mosaicType: 'median'}])
    })

    it('keeps reading the CCDC when another period is shown before it is known', async () => {
        const shown = await show({layerConfig: view('monitoring', 'latest')})
        const reading = [...fake.loads]

        await shown.setLayerConfig(view('calibration', 'median'))

        expect(fake.loads).toEqual(reading)
        expect(reading.some(({torndown}) => torndown)).toBe(false)
    })

    it('rebuilds the preview on a restyle without reading anything again', async () => {
        const shown = await show({layerConfig: view('calibration', 'latest')})
        await shown.answer(CCDC)
        shown.layer()
        const restyled = {...RGB, max: [3000, 3000, 3000]}

        await shown.setLayerConfig(view('calibration', 'latest', restyled))

        expect(shown.layer()).not.toBe(null)
        expect(shown.newReads()).toEqual([])
        expect(fake.constructed.map(({visParams}) => visParams)).toEqual([RGB, restyled])
    })

    it('draws the changed record, never what it drew before, once its record changes', async () => {
        const shown = await show({layerConfig: view('monitoring', 'median')})
        await shown.answer(CCDC)
        const before = shown.layer()

        const edited = shown.edit(model => ({...model, sources: {...model.sources, cloudPercentageThreshold: 50}}))
        await settled()

        expect(shown.layer()).not.toBe(before)
        expect(fake.constructed).toHaveLength(2)
        expect(fake.constructed[1].previewRequest.recipe).toEqual(_.omit(edited, ['ui', 'layers']))
        expect(shown.newReads()).toEqual([])
    })

    it('draws nothing once its reference is replaced by a CCDC not yet read, until that is read', async () => {
        const shown = await show({layerConfig: view('monitoring', 'median')})
        await shown.answer(CCDC)
        shown.layer()

        const edited = shown.edit(model => ({...model, reference: {type: 'RECIPE_REF', id: OTHER_CCDC.id}}))
        await settled()

        expect(shown.layer()).toBe(null)
        expect(shown.newReads()).toContain(OTHER_CCDC.id)
        await shown.answer(OTHER_CCDC)
        expect(shown.layer()).not.toBe(null)
        expect(fake.constructed.at(-1).previewRequest.recipe).toEqual(_.omit(edited, ['ui', 'layers']))
    })

    it('is withheld when its CCDC cannot be read', async () => {
        const shown = await show({layerConfig: view('monitoring', 'latest')})

        await shown.fail(CCDC.id)

        expect(shown.layer()).toBe(null)
        expect(fake.constructed).toEqual([])
    })
})

const ALERTS_ID = 'change-alerts-1'

const CCDC = {
    id: 'ccdc-1',
    type: 'CCDC',
    revision: 1,
    model: {
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}},
        options: {corrections: ['SR']},
        ccdcOptions: {dateFormat: 1},
        dates: {startDate: '2017-01-01', endDate: '2021-01-01'}
    }
}

const OTHER_CCDC = {...CCDC, id: 'ccdc-2'}

const LISTING = [
    {id: ALERTS_ID, name: 'Alerts', type: 'CHANGE_ALERTS', revision: 1},
    {id: CCDC.id, name: 'CCDC', type: 'CCDC', revision: 1},
    {id: OTHER_CCDC.id, name: 'Other CCDC', type: 'CCDC', revision: 1}
]

const changeAlerts = () => ({
    id: ALERTS_ID,
    type: 'CHANGE_ALERTS',
    revision: 1,
    ui: {initialized: true},
    layers: {userDefinedVisualizations: {'this-recipe': []}},
    model: {
        reference: {type: 'RECIPE_REF', id: CCDC.id},
        date: {
            monitoringEnd: '2024-01-01', monitoringDuration: 2, monitoringDurationUnit: 'months',
            calibrationDuration: 3, calibrationDurationUnit: 'months'
        },
        sources: {band: 'ndvi', dataSetType: 'OPTICAL', dataSets: {LANDSAT: ['LANDSAT_8']}},
        options: {corrections: ['SR']},
        changeAlertsOptions: {}
    }
})

// Which records storage was asked for: the CCDC alone, however many of the runtime's parts read it.
const readIds = () => _.uniq(fake.loads.map(({id}) => id))

const RuntimeProbe = withSourceRuntime()(({sourceRuntime, onRuntime}) => {
    onRuntime(sourceRuntime)
    return null
})

// The layer over a real store and the source runtime its provider builds, given the props its selector computes from
// them, recomputed as the store or its config changes, as React Redux would.
const show = async ({layerConfig, inAnotherRecipe = false}) => {
    const recipe = changeAlerts()
    const store = createStore((state = {
        dimensions: {width: 1024, height: 768},
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: {[recipe.id]: recipe},
            recipes: LISTING,
            recipeListing: {checkedAt: Date.now()},
            saveStates: {},
            folders: [],
            tabs: [{id: inAnotherRecipe ? 'host-1' : recipe.id}]
        }
    }, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    let sourceRuntime
    root = createRoot(document.createElement('div'))
    await act(async () => root.render(
        <Provider store={store}>
            <SourceRuntimeProvider>
                <RuntimeProbe onRuntime={runtime => sourceRuntime = runtime}/>
            </SourceRuntimeProvider>
        </Provider>
    ))
    const source = inAnotherRecipe
        ? {id: 'layer-source-1', sourceConfig: {recipeId: recipe.id}}
        : {id: 'this-recipe', sourceConfig: {recipeId: recipe.id}}
    const ownProps = config => ({
        source,
        layerConfig: config,
        sourceRuntime,
        currentRecipe: inAnotherRecipe ? {id: 'host-1', type: 'MOSAIC', model: {}, ui: {initialized: true}} : recipe,
        map: {},
        mapArea: {updateLayerConfig: () => {}},
        tab: {busy: {set: () => {}}},
        boundsChanged$: null,
        dragging$: null,
        cursor$: null
    })
    const propsFor = config => ({...ownProps(config), ...layerSelector(store.getState(), ownProps(config))})
    const instance = new RecipeImageLayer(propsFor(layerConfig))
    const rerender = () => {
        const previous = instance.props
        instance.props = propsFor(instance.props.layerConfig)
        instance.componentDidUpdate(previous)
    }
    instance.forceUpdate = rerender
    store.subscribe(rerender)
    instance.componentDidMount()
    await settled()
    // Every read of the record still waiting is answered alike.
    const settle = async (id, deliver) => {
        const waiting = fake.loads.filter(load => load.id === id && !load.settled)
        waiting.forEach(load => load.settled = true)
        await act(async () => waiting.forEach(({subscriber}) => deliver(subscriber)))
        await settled()
    }
    let answeredReads = 0
    return {
        layer: () => instance.maybeCreateLayer(),
        recipe: () => store.getState().process.loadedRecipes[recipe.id],
        answer: async record => {
            await settle(record.id, subscriber => {
                subscriber.next(record)
                subscriber.complete()
            })
            answeredReads = fake.loads.length
        },
        newReads: () => fake.loads.slice(answeredReads).map(({id}) => id),
        fail: id => settle(id, subscriber => subscriber.error(Object.assign(new Error(`No such recipe: ${id}`), {statusCode: 404}))),
        setLayerConfig: async config => {
            const previous = instance.props
            instance.props = propsFor(config)
            instance.componentDidUpdate(previous)
            await settled()
        },
        // An edit of the recipe's model, as the store applies one.
        edit: change => {
            store.dispatch({
                type: 'EDIT_MODEL',
                reduce: state => _.set(_.cloneDeep(state), ['process', 'loadedRecipes', recipe.id, 'model'],
                    change(state.process.loadedRecipes[recipe.id].model))
            })
            return store.getState().process.loadedRecipes[recipe.id]
        }
    }
}

async function settled() {
    for (let i = 0; i < 8; i++) {
        await act(async () => {})
    }
}
