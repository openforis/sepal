import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {of} from 'rxjs'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {actionBuilder} from '~/action-builder'
import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider, withSourceRuntime} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {initStore} from '~/store'
import {EventShield} from '~/widget/eventShield'
import {PortalContainer, PortalContext} from '~/widget/portal'

// The Classification a Time Series' Sources select is part of its analysis, whatever indicators are asked of it
// (lib/js/shared/src/recipe/type/timeSeries.js): where it cannot be trained - it stores no training points - the Sources
// panel names it beside the classification field, whose own sections say why, SRC is marked, and Retrieve and the pixel
// chart's observations are held naming SRC - one problem, said where it is repaired - without holding the panel's
// Apply. Repairing it, or selecting none, releases them; a supplied decision tree needs no training. The panel, store,
// source runtime and recipe types are real; the recipe reads answer from stored records, Earth Engine an asset's bands
// at once - a radar asset's VV and VH.

const stored = vi.hoisted(() => ({records: {}}))
vi.mock('~/apiRegistry', () => ({default: {
    gee: {
        bands$: ({asset}) => of((asset === 'users/x/radar' ? ['VV', 'VH'] : ['red', 'nir']).map(name => ({name, arrayDimensions: 0}))),
        assetVersions$: ({ids}) => of({assets: ids.map(id => ({id, type: 'IMAGE', version: 'v1'}))})
    },
    recipe: {load$: id => of(stored.records[id]), loadAll$: () => of(LISTING), save$: () => of()}
}}))
vi.mock('~/translate', () => ({msg: (key, values) => {
    const text = [key].flat().join('.')
    return values ? `${text} ${JSON.stringify(values)}` : text
}}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
vi.mock('~/widget/form/assetCombo', () => ({FormAssetCombo: () => null}))
// A tooltip's text is rendered where it is attached, to be read without hovering.
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, disabled, children}) => !disabled && [msg].flat().some(line => typeof line === 'string')
        ? <span data-tooltip={JSON.stringify([msg].flat().filter(line => typeof line === 'string'))}>{children}</span>
        : children
}))
// The Sources panel is open.
vi.mock('~/widget/activation/activatable', () => ({
    withActivatable: () => Component => props => (
        <Component {...props} activatable={{active: true, activate: () => {}, deactivate: () => {}}}/>
    )
}))

const {addRecipeType} = await import('~/app/home/body/process/recipeTypeRegistry')
const {default: timeSeries} = await import('./timeSeries')
const {default: classification} = await import('../classification/classification')
const {default: opticalMosaic} = await import('../opticalMosaic/opticalMosaic')
const {Sources} = await import('./panels/sources/sources')
const {pixelOperationsAvailability, retrieveAvailability, watchOperations} = await import('../operationAvailability')
const {sourceProblemsOfState} = await import('../selectedSourceStatus')

addRecipeType(timeSeries())
addRecipeType(classification())
addRecipeType(opticalMosaic())

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container, store, runtime

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe('a Time Series selecting a Classification that stores no points', () => {
    it('names it beside the classification field, marks SRC, and holds Retrieve and its chart naming SRC, without holding Apply', async () => {
        await open({points: false})

        expect(errorsOf(CLASSIFICATION_LABEL)).toEqual([NEEDS_ATTENTION])
        expect(sourceProblems()).toEqual({sources: NEEDS_ATTENTION})
        expect(retrieveGate()).toMatchObject({code: 'SOURCE_UNSUITABLE', section: SOURCES_BUTTON})
        expect(chartGate()).toMatchObject({withdraw: true, code: 'CONFIGURATION_UNMET', section: SOURCES_BUTTON})

        await act(async () => buttonLabelled(LANDSAT_7).click())
        await settled()
        expect(buttonLabelled('button.apply').disabled).toBe(false)
    })

    it('releases them once the Classification stores points', async () => {
        await open({points: false})

        await act(async () => actionBuilder('ADD_POINTS')
            .set(['process.loadedRecipes', CLASSIFICATION, 'model.trainingData.dataSets'], [COLLECTED])
            .dispatch())
        await settled()

        expect(errorsOf(CLASSIFICATION_LABEL)).toEqual([])
        expect(sourceProblems()).toEqual({})
        expect(retrieveGate()).toBe(null)
        expect(chartGate()).toBe(null)
    })

    it('releases them once its Sources select no Classification', async () => {
        await open({points: false})

        await act(async () => actionBuilder('DESELECT')
            .set(['process.loadedRecipes', SERIES, 'model.sources.classification'], null)
            .dispatch())
        await settled()

        expect(sourceProblems()).toEqual({})
        expect(retrieveGate()).toBe(null)
        expect(chartGate()).toBe(null)
    })
})

// Applied to each image of the collection, a Classification is applied by the band sets of one input image: one of
// several is valid by itself, and unsuitable here, so the repair is selecting another - which may reuse its training data.
describe('a Time Series selecting a trainable Classification of two input images', () => {
    it('says beside the classification field and at SRC that it needs a Classification of one input image, and holds Retrieve and its chart', async () => {
        await open({points: true, inputs: 2})

        expect(errorsOf(CLASSIFICATION_LABEL)).toEqual([TWO_INPUTS])
        expect(sourceProblems()).toEqual({sources: TWO_INPUTS})
        expect(retrieveGate()).toMatchObject({code: 'SOURCE_UNSUITABLE', section: SOURCES_BUTTON})
        expect(chartGate()).toMatchObject({withdraw: true, code: 'CONFIGURATION_UNMET', section: SOURCES_BUTTON})
    })

    it('releases them once it selects a Classification of one input image reusing its training data', async () => {
        await open({points: true, inputs: 2})

        await act(async () => actionBuilder('SELECT_CLASSIFICATION')
            .set(['process.loadedRecipes', SERIES, 'model.sources.classification'], REUSING)
            .dispatch())
        await reopen()
        // Watched as Retrieve and the chart's button watch it, so that what describes the reused Classification's radar
        // input is read.
        const watch = watchOperations({sourceRuntime: runtime, recipeId: SERIES, operations: ['PIXEL_OBSERVATIONS']})
        watch.add(runtime.watchOutput$({recipeId: SERIES, product: {name: 'IMAGE_OUTPUT'}}).subscribe())
        await settled()

        expect(errorsOf(CLASSIFICATION_LABEL)).toEqual([])
        expect(sourceProblems()).toEqual({})
        expect(retrieveGate()).toBe(null)
        expect(chartGate()).toBe(null)
        watch.unsubscribe()
    })
})

describe('a Time Series selecting a supplied decision tree that stores no points', () => {
    it('says nothing of it, holding nothing', async () => {
        await open({points: false, classifier: {type: 'DECISION_TREE', decisionTree: '1) root 9 0 0 (0 1) *'}})

        expect(errorsOf(CLASSIFICATION_LABEL)).toEqual([])
        expect(retrieveGate()).toBe(null)
        expect(chartGate()).toBe(null)
    })
})

const SERIES = 'series-1'
const CLASSIFICATION = 'classification-1'
const REUSING = 'classification-2'
const MOSAIC = 'mosaic-1'
const SOURCES_BUTTON = 'process.timeSeries.panel.sources.button'
const CLASSIFICATION_LABEL = 'process.timeSeries.panel.sources.form.classification.label'
const NEEDS_ATTENTION = 'process.source.status.recipeNeedsAttention {"recipe":"Classification"}'
const TWO_INPUTS = 'process.source.status.multipleClassifierInputs {"recipe":"Classification","count":2}'
const LANDSAT_7 = 'sources.dataSets.LANDSAT_7.label'
const COLLECTED = {dataSetId: 'collected', type: 'COLLECTED', name: 'Collected', referenceData: [{x: 1, y: 1, class: 1}, {x: 2, y: 2, class: 2}]}

const LISTING = [
    {id: SERIES, name: 'Series', type: 'TIME_SERIES', revision: 1},
    {id: CLASSIFICATION, name: 'Classification', type: 'CLASSIFICATION', revision: 1},
    {id: REUSING, name: 'Reusing', type: 'CLASSIFICATION', revision: 1},
    {id: MOSAIC, name: 'Mosaic', type: 'MOSAIC', revision: 1}
]

// Over Landsat 8 scenes, its Sources selecting the Classification.
const seriesRecipe = () => ({
    id: SERIES,
    type: 'TIME_SERIES',
    title: 'Series',
    revision: 1,
    model: {
        aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1]]},
        dates: {startDate: '2020-01-01', endDate: '2021-01-01'},
        sources: {dataSetType: 'OPTICAL', classification: CLASSIFICATION, dataSets: {LANDSAT: ['LANDSAT_8']}, assets: [], cloudPercentageThreshold: 75},
        options: {corrections: ['SR']}
    },
    ui: {initialized: true}
})

// A Sentinel-2 mosaic, described from its configuration: a Classification over it observes nothing.
const mosaicRecipe = () => ({
    id: MOSAIC,
    type: 'MOSAIC',
    title: 'Mosaic',
    revision: 1,
    model: {
        dates: {targetDate: '2023-07-01', seasonStart: '2023-01-01', seasonEnd: '2024-01-01', yearsBefore: 0, yearsAfter: 0},
        sources: {dataSets: {SENTINEL_2: ['SENTINEL_2']}, cloudPercentageThreshold: 100},
        compositeOptions: {corrections: ['SR'], compose: 'MEDIAN'}
    },
    ui: {initialized: true}
})

const MOSAIC_INPUT = {imageId: 'i-1', type: 'RECIPE_REF', id: MOSAIC, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', class: 'IMAGE_BANDS', included: ['red', 'nir']}]}

const RADAR_INPUT = {imageId: 'i-2', type: 'ASSET', id: 'users/x/radar', bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', class: 'IMAGE_BANDS', included: ['VV']}]}

// Over the mosaic, and with `inputs` 2 a radar asset too.
const classificationRecipe = ({classifier, points, inputs = 1}) => ({
    id: CLASSIFICATION,
    type: 'CLASSIFICATION',
    title: 'Classification',
    revision: 1,
    model: {
        inputImagery: {images: [MOSAIC_INPUT, RADAR_INPUT].slice(0, inputs)},
        legend: {entries: [{id: 'a', value: 1, label: 'A', color: '#000000'}, {id: 'b', value: 2, label: 'B', color: '#ffffff'}]},
        classifier,
        trainingData: {dataSets: points ? [COLLECTED] : []}
    },
    ui: {initialized: true}
})

// Over the mosaic alone, trained on the Classification's points.
const reusingRecipe = () => ({
    ...classificationRecipe({classifier: {type: 'RANDOM_FOREST'}, points: false}),
    id: REUSING,
    title: 'Reusing',
    model: {
        ...classificationRecipe({classifier: {type: 'RANDOM_FOREST'}, points: false}).model,
        trainingData: {dataSets: [{dataSetId: 'reused', type: 'RECIPE', name: 'Classification', recipe: CLASSIFICATION}]}
    }
})

const series = () => store.getState().process.loadedRecipes[SERIES]

const heldFor = key => runtime.heldFor(key)

const sourceProblems = () => sourceProblemsOfState(store.getState(), SERIES, id => runtime.evidenceOwnerOf(id), Date.now(), heldFor)

// Why Retrieve is held, as far as what the type declares decides it.
const retrieveGate = () => retrieveAvailability({
    state: store.getState(), recipe: series(), evidenceOwnerOf: id => runtime.evidenceOwnerOf(id), heldFor, now: Date.now()
}).gate

// Why the pixel chart's observations may not be read.
const chartGate = () => pixelOperationsAvailability({state: store.getState(), recipe: series(), heldFor, operations: ['PIXEL_OBSERVATIONS']}).gate

const field = label => document.querySelector(`[data-label="${label}"]`)

// What a field's label says of it as errors: the tooltip of the icon marking them.
const errorsOf = label => {
    const tooltip = field(label)?.querySelector('[data-feedback="error"]')?.closest('[data-tooltip]')
    return tooltip ? JSON.parse(tooltip.dataset.tooltip) : []
}

const buttonLabelled = label => [...document.querySelectorAll('button')].find(button => button.textContent === label)

const RuntimeProbe = withSourceRuntime()(({sourceRuntime}) => {
    runtime = sourceRuntime
    return null
})

async function open({points, classifier = {type: 'RANDOM_FOREST'}, inputs}) {
    const records = [seriesRecipe(), classificationRecipe({classifier, points, inputs}), reusingRecipe(), mosaicRecipe()]
    stored.records = Object.fromEntries(records.map(record => [record.id, record]))
    const initialState = {
        dimensions: {width: 1024, height: 768},
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: Object.fromEntries(records.map(record => [record.id, record])),
            recipes: LISTING,
            recipeListing: {checkedAt: Date.now()},
            saveStates: {},
            projects: [],
            tabs: [{id: SERIES}]
        }
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    await render()
}

// The Sources panel opened again, its form holding what is now applied.
async function reopen() {
    await act(async () => root.unmount())
    container.remove()
    await render()
}

async function render() {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(
        <Provider store={store}>
            <SourceRuntimeProvider>
                <RuntimeProbe/>
                <PortalContainer/>
                <PortalContainer id='test-portal'/>
                <PortalContext id='test-portal'>
                    <EventShield>
                        <Recipe id={SERIES}>
                            <Sources/>
                        </Recipe>
                    </EventShield>
                </PortalContext>
            </SourceRuntimeProvider>
        </Provider>
    ))
    await settled()
}

async function settled() {
    for (let i = 0; i < 8; i++) {
        await act(async () => {})
    }
}
