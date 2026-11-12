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

const fake = vi.hoisted(() => ({storage: null, geeReads: [], constructed: [], selectors: [], listing: [], assets: {}}))

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
// Storage answers each read when the test says so, and each save as the recipe module does
// (recipeStorage.test.fixtures.js). Earth Engine is recorded and answers only what the CCDC the changes
// are built over can be asked for - or a segments asset's bands, with the properties it records, and its token - nothing
// of a mosaic itself.
vi.mock('~/apiRegistry', async () => {
    const {of, throwError} = await import('rxjs')
    const {bandsAnswer} = await import('../../sourceRuntime/bandsAnswer.test.fixtures')
    const catalogue = bandsAnswer({bands: ['tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb', 'ndvi_coefs', 'ndvi_rmse', 'ndvi_magnitude']})
    return {default: {
        recipe: {
            load$: id => fake.storage.load$(id),
            loadAll$: () => of(fake.listing),
            save$: request => fake.storage.save$(request)
        },
        gee: new Proxy({}, {
            get: (_target, name) => args => {
                fake.geeReads.push([name, args])
                const asset = fake.assets[args.asset]
                if (name === 'bands$' && asset) {
                    return of(bandsAnswer(asset)(args))
                }
                if (name === 'assetVersions$') {
                    return of({assets: args.ids.map(id => ({id, type: 'IMAGE', version: 'v1'}))})
                }
                return name === 'bands$'
                    ? of(catalogue(args))
                    : throwError(() => new Error(`Earth Engine is not asked here: ${name}`))
            }
        })
    }}
})

// The layer's selector is the last connected while its module loads: a module's body runs after its imports'.
const {RecipeImageLayer} = await import('../map/recipeImageLayer')
const layerSelector = fake.selectors.at(-1)
const {addRecipeType} = await import('../../recipeTypeRegistry')
const {default: changeAlertsType} = await import('./changeAlerts')
const {default: ccdcType} = await import('../ccdc/ccdc')
const {default: maskingType} = await import('../masking/masking')
const {SourceRuntimeProvider, withSourceRuntime} = await import('../../sourceRuntime/sourceRuntimeContext')
const {disposeInstalledSessions, installStore} = await import('~/app/home/body/process/recipeSession/recipeSession.test.fixtures')
const {recipeSessionOf} = await import('../../recipeSession/recipeSession')
const {recipeStorage} = await import('../../recipeSession/recipeStorage.test.fixtures')

addRecipeType(changeAlertsType())
addRecipeType(ccdcType())
addRecipeType(maskingType())

globalThis.IS_REACT_ACT_ENVIRONMENT = true

beforeEach(() => {
    fake.storage = recipeStorage({answerReads: false})
    fake.geeReads = []
    fake.constructed = []
    fake.listing = LISTING
    fake.assets = {}
})

let root
let unmountLayer

afterEach(disposeInstalledSessions)

afterEach(async () => {
    await act(async () => unmountLayer?.())
    unmountLayer = null
    await act(async () => root?.unmount())
    root = null
})

// Run before the teardown above cancels them.
afterEach(context => fake.storage.reportPendingReads(context))

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
        // What the CCDC can be asked for, describing the processing the mosaic is read under: no image is evaluated.
        expect(fake.geeReads).toEqual([['bands$', {recipe: expect.objectContaining({id: CCDC.id})}]])
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
        const reading = fake.storage.reads()

        await shown.setLayerConfig(view('calibration', 'median'))

        expect(fake.storage.reads()).toEqual(reading)
        expect(fake.storage.pendingReads()).toEqual(reading)
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

// Every mode a Change Alerts layer shows - its changes, and the latest or median mosaic of calibration or of monitoring -
// is held by the Sources and Dates its changes are computed over, which need imagery possible in both windows: calibration
// 2010-2012 and monitoring 2013-2020 here, Landsat 4-5 covering only the one and Landsat 8 only the other.
describe('a Change Alerts layer over data sets that may not cover both its windows', () => {
    const RGB = {id: 'rgb', type: 'rgb', bands: ['red', 'green', 'blue'], min: [0, 0, 0], max: [2000, 2000, 2000]}
    const CONFIDENCE = {id: 'confidence', type: 'continuous', bands: ['confidence'], min: [0], max: [100], palette: ['#000000', '#ffffff']}
    const MODES = [
        ['the changes', {visualizationType: 'changes', mosaicType: 'latest', visParams: CONFIDENCE}],
        ...['calibration', 'monitoring'].flatMap(period => ['latest', 'median'].map(mosaicType =>
            [`the ${mosaicType} ${period} mosaic`, {visualizationType: period, mosaicType, visParams: RGB}]))
    ]
    const WINDOWS = {
        monitoringEnd: '2021-01-01', monitoringDuration: 96, monitoringDurationUnit: 'months',
        calibrationDuration: 36, calibrationDurationUnit: 'months'
    }
    const over = (dataSets, date = WINDOWS) => ({date, sources: {band: 'ndvi', dataSetType: 'OPTICAL', dataSets: {LANDSAT: dataSets}}})

    it.each(MODES)('draws %s over Landsat 4-5 and 8 together', async (_mode, layerConfig) => {
        const shown = await show({layerConfig, model: over(['LANDSAT_8', 'LANDSAT_TM'])})

        await shown.answer(CCDC)

        expect(shown.layer()).not.toBe(null)
    })

    it.each(MODES)('withdraws %s while Landsat 8 alone leaves calibration uncovered, drawing it once Sources add Landsat 4-5', async (_mode, layerConfig) => {
        const shown = await show({layerConfig, model: over(['LANDSAT_8'])})
        await shown.answer(CCDC)
        expect(shown.layer()).toBe(null)

        shown.edit(model => ({...model, sources: {...model.sources, dataSets: {LANDSAT: ['LANDSAT_8', 'LANDSAT_TM']}}}))
        await settled()

        expect(shown.layer()).not.toBe(null)
    })

    it.each(MODES)('withdraws %s while Landsat 4-5 alone leaves monitoring uncovered, drawing it once Dates move both into its years', async (_mode, layerConfig) => {
        const shown = await show({layerConfig, model: over(['LANDSAT_TM'])})
        await shown.answer(CCDC)
        expect(shown.layer()).toBe(null)

        shown.edit(model => ({...model, date: {...model.date, monitoringEnd: '2013-01-01', monitoringDuration: 36}}))
        await settled()

        expect(shown.layer()).not.toBe(null)
    })

    it.each(MODES)('withdraws %s while Dates place both windows before Landsat 8, drawing it once they move into its years', async (_mode, layerConfig) => {
        const shown = await show({layerConfig, model: over(['LANDSAT_8'], {...WINDOWS, monitoringEnd: '2012-01-01', monitoringDuration: 12, calibrationDuration: 12})})
        await shown.answer(CCDC)
        expect(shown.layer()).toBe(null)

        shown.edit(model => ({...model, date: {...WINDOWS, monitoringEnd: '2024-01-01', monitoringDuration: 36}}))
        await settled()

        expect(shown.layer()).not.toBe(null)
    })

    // Calibration December 2011 to February 2012, monitoring March and April 2012: Landsat 4-5's surface reflectance covers
    // both, its top of atmosphere neither. The CCDC's correction is the one its imagery is read with, whatever the alerts
    // saved.
    const EARLY_2012 = {...WINDOWS, monitoringEnd: '2012-05-01', monitoringDuration: 2, calibrationDuration: 3}
    const reading = corrections => ({...CCDC, model: {...CCDC.model, options: {corrections}}})

    it.each(MODES)('draws %s over Landsat 4-5 saved top of atmosphere where its CCDC reads SR', async (_mode, layerConfig) => {
        const shown = await show({layerConfig, model: {...over(['LANDSAT_TM'], EARLY_2012), options: {corrections: []}}})

        await shown.answer(reading(['SR']))

        expect(shown.layer()).not.toBe(null)
    })

    it.each(MODES)('withdraws %s, requesting no preview, over Landsat 4-5 saved with SR where its CCDC reads top of atmosphere', async (_mode, layerConfig) => {
        const shown = await show({layerConfig, model: {...over(['LANDSAT_TM'], EARLY_2012), options: {corrections: ['SR']}}})

        await shown.answer(reading([]))

        expect(shown.layer()).toBe(null)
        expect(fake.constructed).toEqual([])
    })

    // Calibration September to November 2012, monitoring December 2012 and January 2013: after Landsat 4-5's last
    // acquisition, in 2012 as its years are, before any preview is requested.
    it.each(MODES)('withdraws %s, requesting no preview, while Landsat 4-5 alone ended before both windows, drawing it once Sources choose Landsat 7', async (_mode, layerConfig) => {
        const gap = {...WINDOWS, monitoringEnd: '2013-02-01', monitoringDuration: 2, calibrationDuration: 3}
        const shown = await show({layerConfig, model: over(['LANDSAT_TM'], gap)})
        await shown.answer(CCDC)
        expect(shown.layer()).toBe(null)
        expect(fake.constructed).toEqual([])

        shown.edit(model => ({...model, sources: {...model.sources, dataSets: {LANDSAT: ['LANDSAT_7']}}}))
        await settled()

        expect(shown.layer()).not.toBe(null)
    })
})

// A layer showing a recipe whose image is the changes - a Masking of them, masked by the CCDC - is held by what holds
// the changes, found by the layer's own read, though the alerts are not open: the session holds their record, and the
// CCDC's, but no editor of theirs watches their evidence.
describe('a layer showing a Masking of Change Alerts that are not open', () => {
    const CONFIDENCE = {id: 'confidence', type: 'continuous', bands: ['confidence'], min: [0], max: [100], palette: ['#000000', '#ffffff']}
    const masking = {
        id: MASKING_ID, type: 'MASKING', revision: 1, ui: {initialized: true}, layers: {userDefinedVisualizations: {'this-recipe': [CONFIDENCE]}},
        model: {imageToMask: {type: 'RECIPE_REF', id: ALERTS_ID}, imageMask: {type: 'RECIPE_REF', id: CCDC.id}}
    }
    // Calibration September to November 2012, monitoring December 2012 and January 2013: before Landsat 8's first
    // acquisition, under either correction.
    const BEFORE_LANDSAT_8 = {
        monitoringEnd: '2013-02-01', monitoringDuration: 2, monitoringDurationUnit: 'months',
        calibrationDuration: 3, calibrationDurationUnit: 'months'
    }

    it('is withdrawn, requesting no preview, once the alerts\' Dates leave Landsat 8 nothing to cover, and drawn again once they cover it', async () => {
        const shown = await show({layerConfig: {visParams: CONFIDENCE}, shown: masking, others: [changeAlerts(), CCDC]})
        expect(shown.layer()).not.toBe(null)
        const drawn = fake.constructed.length

        shown.edit(model => ({...model, date: BEFORE_LANDSAT_8}), ALERTS_ID)
        await settled()
        expect(shown.layer()).toBe(null)
        expect(fake.constructed).toHaveLength(drawn)

        shown.edit(model => ({...model, date: changeAlerts().model.date}), ALERTS_ID)
        await settled()
        expect(shown.layer()).not.toBe(null)
    })

    // Calibration December 2011 to February 2012, monitoring March and April 2012: Landsat 4-5's surface reflectance
    // covers both, its top of atmosphere neither. The CCDC's correction is what the changes are read with.
    it.each([
        ['draws', 'saved top of atmosphere where the CCDC reads SR', [], ['SR'], true],
        ['withdraws', 'saved with SR where the CCDC reads top of atmosphere', ['SR'], [], false]
    ])('%s it over Landsat 4-5 %s', async (_drawing, _case, saved, read, drawn) => {
        const alerts = changeAlerts({
            date: {monitoringEnd: '2012-05-01', monitoringDuration: 2, monitoringDurationUnit: 'months', calibrationDuration: 3, calibrationDurationUnit: 'months'},
            sources: {band: 'ndvi', dataSetType: 'OPTICAL', dataSets: {LANDSAT: ['LANDSAT_TM']}},
            options: {corrections: saved}
        })
        const ccdc = {...CCDC, model: {...CCDC.model, options: {corrections: read}}}

        const shown = await show({layerConfig: {visParams: CONFIDENCE}, shown: masking, others: [alerts, ccdc]})

        expect(shown.layer() !== null).toBe(drawn)
    })

    // The changes are computed under the processing their segments record (changeAlerts/processing.js), which must be
    // readable: an asset recording it so that it cannot be read holds them, and the Masking of them, until it is repaired.
    it('is withdrawn, requesting no preview, while the alerts\' segments record processing that cannot be read, and drawn once they are repaired', async () => {
        fake.assets[SEGMENTS_ASSET] = segmentsAsset({dateFormat: 1, surfaceReflectance: 'yes'})
        const alerts = changeAlerts({reference: {type: 'ASSET', id: SEGMENTS_ASSET}})

        const shown = await show({layerConfig: {visParams: CONFIDENCE}, shown: masking, others: [alerts, CCDC]})
        expect(shown.layer()).toBe(null)
        expect(fake.constructed).toEqual([])

        fake.assets[SEGMENTS_ASSET] = segmentsAsset({dateFormat: 1, surfaceReflectance: true})
        await shown.refreshAsset(SEGMENTS_ASSET)
        expect(shown.layer()).not.toBe(null)
    })
})

const SEGMENTS_ASSET = 'users/x/segments'

// A segments asset as Earth Engine answers for it: its bands, and the properties it records its processing in.
const segmentsAsset = properties => ({
    bands: [['tStart', 1], ['tEnd', 1], ['tBreak', 1], ['numObs', 1], ['changeProb', 1], ['ndvi_coefs', 2], ['ndvi_rmse', 1], ['ndvi_magnitude', 1]]
        .map(([name, arrayDimensions]) => ({name, arrayDimensions})),
    properties
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

const MASKING_ID = 'masking-1'

const LISTING = [
    {id: ALERTS_ID, name: 'Alerts', type: 'CHANGE_ALERTS', revision: 1},
    {id: MASKING_ID, name: 'Masking', type: 'MASKING', revision: 1},
    {id: CCDC.id, name: 'CCDC', type: 'CCDC', revision: 1},
    {id: OTHER_CCDC.id, name: 'Other CCDC', type: 'CCDC', revision: 1}
]

const changeAlerts = (model = {}) => ({
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
        changeAlertsOptions: {},
        ...model
    }
})

// Which records storage was asked for: the CCDC alone, however many of the runtime's parts read it.
const readIds = () => _.uniq(fake.storage.reads())

const RuntimeProbe = withSourceRuntime()(({sourceRuntime, onRuntime}) => {
    onRuntime(sourceRuntime)
    return null
})

// The layer over a real store and the source runtime its provider builds, given the props its selector computes from
// them, recomputed as the store or its config changes, as React Redux would. The source component a map renders beside
// the layer claims the recipe it shows while mounted (recipeImageLayerSource.jsx, through recipeAccess.jsx): that claim
// alone keeps a recipe that is not open in the session. Unmounting releases the layer, then the claim; the store's
// session is disposed as the test ends. `shown` replaces the alerts as the recipe the layer shows, `others` the records
// the session holds besides it, none open. Storage holds them all; a read nothing has answered is named beside a test
// that failed.
const show = async ({layerConfig, inAnotherRecipe = false, model, shown, others = []}) => {
    const recipe = shown || changeAlerts(model)
    ;[recipe, ...others].forEach(record => fake.storage.store(record))
    const held = inAnotherRecipe ? [recipe, ...others] : others
    const store = createStore((state = {
        dimensions: {width: 1024, height: 768},
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: Object.fromEntries(held.map(record => [record.id, record])),
            recipes: LISTING,
            recipeListing: {checkedAt: Date.now()},
            saveStates: {},
            projects: [],
            tabs: inAnotherRecipe ? [{id: 'host-1'}] : []
        }
    }, action) => action.reduce ? action.reduce(state) : state)
    installStore(store)
    // As the application installs its store, with its session, which opens the recipe shown at the revision it was loaded
    // at before its tab is (openRecipeById$, recipe.jsx).
    const session = recipeSessionOf(store)
    if (!inAnotherRecipe) {
        session.openRecipeRevision(recipe)
        store.dispatch({type: 'OPEN_RECIPE', reduce: state => _.set(_.cloneDeep(state), ['process', 'tabs'], [{id: recipe.id}])})
    }
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
    const sourceClaim = session.claimant()
    sourceClaim.use(recipe.id)
    const propsFor = config => ({...ownProps(config), ...layerSelector(store.getState(), ownProps(config))})
    const instance = new RecipeImageLayer(propsFor(layerConfig))
    const rerender = () => {
        const previous = instance.props
        instance.props = propsFor(instance.props.layerConfig)
        instance.componentDidUpdate(previous)
    }
    instance.forceUpdate = rerender
    const unsubscribe = store.subscribe(rerender)
    instance.componentDidMount()
    unmountLayer = () => {
        unsubscribe()
        instance.componentWillUnmount()
        sourceClaim.release()
    }
    await settled()
    // Every read of the record still waiting is answered alike.
    const settle = async answer => {
        await act(async () => answer())
        await settled()
    }
    let answeredReads = 0
    return {
        layer: () => instance.maybeCreateLayer(),
        recipe: () => store.getState().process.loadedRecipes[recipe.id],
        answer: async record => {
            await settle(() => fake.storage.answer(record.id, record))
            answeredReads = fake.storage.reads().length
        },
        newReads: () => fake.storage.reads().slice(answeredReads),
        // An asset read again, and everything reading it, as a Refresh asks.
        refreshAsset: async id => {
            await act(async () => sourceRuntime.refreshAsset(id))
            await settled()
        },
        fail: id => settle(() => fake.storage.fail(id)),
        setLayerConfig: async config => {
            const previous = instance.props
            instance.props = propsFor(config)
            instance.componentDidUpdate(previous)
            await settled()
        },
        // An edit of the recipe's model - or another's the session holds - as the store applies one.
        edit: (change, id = recipe.id) => {
            store.dispatch({
                type: 'EDIT_MODEL',
                reduce: state => _.set(_.cloneDeep(state), ['process', 'loadedRecipes', id, 'model'],
                    change(state.process.loadedRecipes[id].model))
            })
            return store.getState().process.loadedRecipes[id]
        }
    }
}

async function settled() {
    for (let i = 0; i < 8; i++) {
        await act(async () => {})
    }
}
