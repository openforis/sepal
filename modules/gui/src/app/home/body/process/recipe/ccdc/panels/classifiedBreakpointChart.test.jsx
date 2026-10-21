import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {finalize, of, Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {actionBuilder} from '~/action-builder'
import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {MapContext} from '~/app/home/map/mapContext'
import {initStore, select} from '~/store'
import {PortalContainer, PortalContext} from '~/widget/portal'

// The segments an open CCDC chart fits at its pixel to a breakpoint band its selected Classification computes train
// that Classification's classifier: once it cannot be trained - it stores no training points - the chart closes,
// letting go of what it was reading, and its action is withdrawn until the Classification can be trained again.
// Breakpoint bands of the images need nothing of it. The registrations, store, source runtime, readiness, chart and
// its action are real; Earth Engine, storage, the map, the graph renderer and the toolbar's and band picker's widgets
// are replaced.

const {loadCCDCSegments$, loadTimeSeriesObservations$} = vi.hoisted(() => ({
    loadCCDCSegments$: vi.fn(),
    loadTimeSeriesObservations$: vi.fn()
}))
const stored = vi.hoisted(() => ({records: {}}))
vi.mock('~/apiRegistry', () => ({default: {
    gee: {
        loadCCDCSegments$,
        loadTimeSeriesObservations$,
        bands$: ({recipe}) => of(recipe?.type === 'CCDC'
            ? ['tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb', 'ndvi_coefs', 'ndvi_rmse', 'ndvi_magnitude']
            : ['red', 'nir'].map(name => ({name, arrayDimensions: 0}))),
        assetVersions$: ({ids}) => of({assets: ids.map(id => ({id, type: 'IMAGE', version: 'v1'}))})
    },
    recipe: {load$: id => of(stored.records[id]), loadAll$: () => of(LISTING)}
}}))
vi.mock('~/translate', () => ({msg: key => (Array.isArray(key) ? key.join('.') : key)}))
vi.mock('~/user', () => ({}))
vi.mock('~/eventPublisher', () => ({publishEvent: () => {}}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
vi.mock('~/widget/tooltip', () => ({Tooltip: ({children}) => children}))
vi.mock('~/widget/keybinding', () => ({Keybinding: ({children}) => children}))
vi.mock('~/widget/icon', () => ({Icon: () => null}))
vi.mock('~/widget/toolbar/toolbar', () => ({
    Toolbar: {Button: ({onClick, disabled}) => <button aria-label='chart' disabled={disabled} onClick={onClick}/>}
}))
vi.mock('../ccdcGraph', () => ({CCDCGraph: () => <output aria-label='graph'/>}))
vi.mock('~/widget/form', async importOriginal => {
    const {Form} = await importOriginal()
    return {
        Form: {
            ...Form,
            Combo: ({input, options}) =>
                <select aria-label='band' value={input.value || ''} onChange={event => input.set(event.target.value)}>
                    {options.map(({value}) => <option key={value} value={value}>{value}</option>)}
                </select>
        }
    }
})

const {addRecipeType} = await import('../../../recipeTypeRegistry')
const {default: ccdc} = await import('../ccdc')
const {default: classification} = await import('../../classification/classification')
const {default: opticalMosaic} = await import('../../opticalMosaic/opticalMosaic')
const {RecipeActions} = await import('../ccdcRecipe')
const {ChartPixelButton} = await import('../../chartPixelButton')
const {CHART_OPERATIONS, ChartPixel} = await import('./chartPixel')

addRecipeType(ccdc())
addRecipeType(classification())
addRecipeType(opticalMosaic())

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container, map

beforeEach(() => {
    loadCCDCSegments$.mockReset().mockReturnValue(of([]))
    loadTimeSeriesObservations$.mockReset().mockReturnValue(of({features: []}))
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe('an open CCDC chart fitting a breakpoint band its Classification computes', () => {
    it('closes, letting go of the segments it was reading, and withdraws its action, once that Classification stores no points', async () => {
        const pending = new Subject()
        let cancelled = false
        loadCCDCSegments$.mockReturnValueOnce(pending.pipe(finalize(() => cancelled = true)))
        await open({breakpointBands: CLASSIFIED})
        await chartAt(PIXEL)
        expect(loadCCDCSegments$).toHaveBeenCalledTimes(1)

        await holdTrainingData([])

        expect(chartPixel()).toBe(null)
        expect(cancelled).toBe(true)
        expect(loadCCDCSegments$).toHaveBeenCalledTimes(1)
        expect(chartButton().disabled).toBe(true)
    })

    it('is offered again once the Classification stores points again, reading the segments once a pixel is charted again', async () => {
        await open({breakpointBands: CLASSIFIED})
        await chartAt(PIXEL)
        await holdTrainingData([])
        expect(chartButton().disabled).toBe(true)

        await holdTrainingData([COLLECTED])
        expect(chartButton().disabled).toBe(false)
        await chartAt(OTHER_PIXEL)

        expect(loadCCDCSegments$).toHaveBeenCalledTimes(2)
        expect(loadCCDCSegments$.mock.lastCall[0]).toMatchObject({latLng: OTHER_PIXEL, bands: ['ndvi']})
    })
})

describe('an open CCDC chart fitting breakpoint bands of the images alone', () => {
    it('stays open, and its action offered, once its Classification stores no points', async () => {
        await open({breakpointBands: ['ndvi']})
        await chartAt(PIXEL)

        await holdTrainingData([])

        expect(chartPixel()).toEqual(PIXEL)
        expect(chartButton().disabled).toBe(false)
    })
})

const CCDC = 'ccdc-1'
const CLASSIFICATION = 'classification-1'
const MOSAIC = 'mosaic-1'
const PIXEL = {lat: 1, lng: 2}
const OTHER_PIXEL = {lat: 3, lng: 4}
const CLASSIFIED = ['ndvi', 'probability_1']
const COLLECTED = {dataSetId: 'collected', type: 'COLLECTED', name: 'Collected', referenceData: [{x: 1, y: 1, class: 1}, {x: 2, y: 2, class: 2}]}

const LISTING = [
    {id: CCDC, name: 'CCDC', type: 'CCDC', revision: 1},
    {id: CLASSIFICATION, name: 'Classification', type: 'CLASSIFICATION', revision: 1},
    {id: MOSAIC, name: 'Mosaic', type: 'MOSAIC', revision: 1}
]

// Over Landsat 8 scenes, its breakpoint bands as given.
const ccdcRecipe = ({breakpointBands}) => ({
    id: CCDC,
    type: 'CCDC',
    title: 'CCDC',
    revision: 1,
    model: {
        aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1]]},
        dates: {startDate: '2020-01-01', endDate: '2021-01-01'},
        sources: {dataSetType: 'OPTICAL', classification: CLASSIFICATION, dataSets: {LANDSAT: ['LANDSAT_8']}, assets: [], cloudPercentageThreshold: 75, breakpointBands},
        options: {corrections: ['SR']},
        opticalPreprocess: {corrections: ['SR']},
        ccdcOptions: {dateFormat: 1}
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

// A Random Forest storing training points.
const classificationRecipe = () => ({
    id: CLASSIFICATION,
    type: 'CLASSIFICATION',
    title: 'Classification',
    revision: 1,
    model: {
        inputImagery: {images: [{imageId: 'i-1', type: 'RECIPE_REF', id: MOSAIC, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', class: 'IMAGE_BANDS', included: ['red', 'nir']}]}]},
        legend: {entries: [{id: 'a', value: 1, label: 'A', color: '#000000'}, {id: 'b', value: 2, label: 'B', color: '#ffffff'}]},
        classifier: {type: 'RANDOM_FOREST'},
        trainingData: {dataSets: [COLLECTED]}
    },
    ui: {initialized: true}
})

const chartPixel = () => select(['process.loadedRecipes', CCDC, 'ui.chartPixel']) ?? null

const chartButton = () => container.querySelector('button[aria-label=chart]')

// The pixel is chosen on the map, as the chart's action has it listen for.
const chartAt = async latLng => {
    await act(async () => chartButton().click())
    await act(async () => map.click(latLng))
    await settled()
}

const holdTrainingData = async dataSets => {
    await act(async () => actionBuilder('EDIT_TRAINING_DATA')
        .set(['process.loadedRecipes', CLASSIFICATION, 'model.trainingData.dataSets'], dataSets)
        .dispatch())
    await settled()
}

// A map that hands the pixel clicked to whoever listens for one.
const mapOf = () => {
    let listener = null
    return {
        getZoom: () => 1,
        setView: () => {},
        addOneShotClickListener: callback => {
            listener = callback
            return {remove: () => listener = null}
        },
        enterInteractionMode: () => ({remove: () => {}}),
        click: latLng => listener?.(latLng)
    }
}

async function open({breakpointBands}) {
    const records = [ccdcRecipe({breakpointBands}), classificationRecipe(), mosaicRecipe()]
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
            tabs: [{id: CCDC}]
        }
    }
    const store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    map = mapOf()
    const recipeActions = RecipeActions(CCDC)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(
        <Provider store={store}>
            <SourceRuntimeProvider>
                <MapContext map={map}>
                    <PortalContainer id='chart-panel'/>
                    <PortalContext id='chart-panel'>
                        <Recipe id={CCDC}>
                            <ChartPixelButton operations={CHART_OPERATIONS} onPixelSelected={latLng => recipeActions.setChartPixel(latLng)}/>
                            <ChartPixel values={{selectedBand: 'ndvi'}}/>
                        </Recipe>
                    </PortalContext>
                </MapContext>
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
