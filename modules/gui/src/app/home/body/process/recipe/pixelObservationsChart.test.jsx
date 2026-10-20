import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {finalize, of, Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {actionBuilder} from '~/action-builder'
import {Recipe} from '~/app/home/body/process/recipeContext'
import {initStore, select} from '~/store'
import {PortalContainer, PortalContext} from '~/widget/portal'

// An open Time Series or CCDC chart reads its pixel's observations only while what the recipe's type declares they
// require is known to be met (pixelObservationsAvailability). Asked while the Classification is still to be read, it asks
// once it is; found unmet, the chart closes and what it was reading is let go, so a late answer draws nothing. The
// registrations, readiness, store and chart are real; the Earth Engine requests and the graph renderer are replaced.

const {loadCCDCSegments$, loadTimeSeriesObservations$} = vi.hoisted(() => ({
    loadCCDCSegments$: vi.fn(),
    loadTimeSeriesObservations$: vi.fn()
}))
vi.mock('~/apiRegistry', () => ({default: {gee: {loadCCDCSegments$, loadTimeSeriesObservations$}}}))
vi.mock('~/translate', () => ({msg: key => (Array.isArray(key) ? key.join('.') : key)}))
vi.mock('~/user', () => ({}))
vi.mock('~/eventPublisher', () => ({publishEvent: () => {}}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
vi.mock('~/sources', () => ({
    getAvailableBands: () => ['ndvi'],
    flatBandOptions: () => [{value: 'ndvi', label: 'ndvi'}],
    toDataSetIds: dataSets => dataSets
}))
vi.mock('./ccdc/ccdcGraph', () => ({
    CCDCGraph: ({observations}) => <output aria-label='chart'>{JSON.stringify({observations})}</output>
}))

const {addRecipeType} = await import('../recipeTypeRegistry')
const {default: ccdc} = await import('./ccdc/ccdc')
const {default: timeSeries} = await import('./timeSeries/timeSeries')
const {ChartPixel: CcdcChartPixel} = await import('./ccdc/panels/chartPixel')
const {ChartPixel: TimeSeriesChartPixel} = await import('./timeSeries/panels/chartPixel')

addRecipeType(ccdc())
addRecipeType(timeSeries())

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container

beforeEach(() => {
    loadCCDCSegments$.mockReset().mockReturnValue(of([]))
    loadTimeSeriesObservations$.mockReset().mockReturnValue(of({features: []}))
})

afterEach(() => {
    act(() => root?.unmount())
    root = null
    container?.remove()
})

describe.each([
    ['TIME_SERIES', TimeSeriesChartPixel],
    ['CCDC', CcdcChartPixel]
])('an open %s chart', (type, ChartPixel) => {
    it('is closed where the classification is found not to suit the images, letting go of what it was reading', () => {
        const pending = new Subject()
        let cancelled = false
        loadTimeSeriesObservations$.mockReturnValueOnce(pending.pipe(finalize(() => cancelled = true)))
        openChart(ChartPixel, recipeOf(type), classificationOver(COMPATIBLE))
        expect(loadTimeSeriesObservations$).toHaveBeenCalledTimes(1)

        holdClassification(classificationOver(RADAR_STATISTICS))

        expect(cancelled).toBe(true)
        expect(chartPixel()).toBe(null)
        act(() => {
            pending.next({features: [{properties: {date: {value: 0}, value: 1}}]})
            pending.complete()
        })
        expect(container.querySelector('output')).toBe(null)
    })

    it('lets go of what it was reading once the classification is no longer held, and reads again once it is', () => {
        const pending = new Subject()
        let cancelled = false
        loadTimeSeriesObservations$.mockReturnValueOnce(pending.pipe(finalize(() => cancelled = true)))
        openChart(ChartPixel, recipeOf(type), classificationOver(COMPATIBLE))

        releaseClassification()

        expect(cancelled).toBe(true)
        expect(chartPixel()).toEqual(PIXEL)
        act(() => {
            pending.next({features: [STALE]})
            pending.complete()
        })
        expect(charted()).toBe(null)

        loadTimeSeriesObservations$.mockReturnValue(of({features: [CURRENT]}))
        holdClassification(classificationOver(COMPATIBLE))

        expect(loadTimeSeriesObservations$).toHaveBeenCalledTimes(2)
        expect(charted()).toEqual({features: [CURRENT]})
    })

    it('reads nothing while the classification is still to be read, then reads the pixel once it suits the images', () => {
        openChart(ChartPixel, recipeOf(type))
        expect(loadTimeSeriesObservations$).not.toHaveBeenCalled()
        expect(chartPixel()).toEqual(PIXEL)

        holdClassification(classificationOver(COMPATIBLE))

        expect(loadTimeSeriesObservations$).toHaveBeenCalledTimes(1)
        expect(loadTimeSeriesObservations$.mock.calls[0][0]).toMatchObject({latLng: PIXEL, bands: ['ndvi']})
    })

    it('is read over an AOI the session cannot resolve, which observations do not read', () => {
        openChart(ChartPixel, recipeOf(type, {aoi: {type: 'RECIPE', id: 'aoi-recipe'}}), classificationOver(COMPATIBLE))

        expect(loadTimeSeriesObservations$).toHaveBeenCalledTimes(1)
    })
})

const ID = 'recipe-1'
const CLASSIFICATION = 'classification-1'
const PIXEL = {lat: 1, lng: 2}
const COMPATIBLE = ['red', 'nir', 'ndvi']
const RADAR_STATISTICS = ['VV_mean', 'VH_med']
const STALE = {properties: {date: {value: 0}, value: 1}}
const CURRENT = {properties: {date: {value: 0}, value: 2}}

const recipeOf = (type, {aoi = {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1]]}} = {}) => ({
    id: ID,
    type,
    title: 'Recipe',
    model: {
        aoi,
        dates: {startDate: '2020-01-01', endDate: '2021-01-01'},
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, breakpointBands: ['ndvi'], classification: CLASSIFICATION},
        options: {corrections: ['SR']},
        ccdcOptions: {dateFormat: 0}
    },
    ui: {}
})

const classificationOver = included => ({
    id: CLASSIFICATION,
    type: 'CLASSIFICATION',
    model: {inputImagery: {images: [{imageId: 'i-1', type: 'ASSET', id: 'users/x/input', bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included}]}]}}
})

const chartPixel = () => select(['process.loadedRecipes', ID, 'ui.chartPixel']) ?? null

// The observations drawn, or null while none are.
const charted = () => {
    const output = container.querySelector('output')
    return output ? JSON.parse(output.textContent).observations ?? null : null
}

const releaseClassification = () => act(() => actionBuilder('RELEASE_CLASSIFICATION')
    .del(['process.loadedRecipes', CLASSIFICATION])
    .dispatch())

const holdClassification = classification => act(() => actionBuilder('HOLD_CLASSIFICATION')
    .set(['process.loadedRecipes', CLASSIFICATION], classification)
    .dispatch())

const openChart = (ChartPixel, recipe, classification) => {
    const initialState = {
        dimensions: {width: 1024, height: 768},
        process: {
            loadedRecipes: Object.fromEntries([recipe, classification].filter(Boolean).map(record => [record.id, record])),
            tabs: [{id: recipe.id}],
            recipes: []
        }
    }
    const store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root.render(
        <Provider store={store}>
            <PortalContainer id='chart-panel'/>
            <PortalContext id='chart-panel'>
                <Recipe id={recipe.id}>
                    <ChartPixel values={{selectedBand: 'ndvi'}}/>
                </Recipe>
            </PortalContext>
        </Provider>
    ))
    act(() => actionBuilder('CHART_PIXEL')
        .set(['process.loadedRecipes', recipe.id, 'ui.chartPixel'], PIXEL)
        .dispatch())
}
