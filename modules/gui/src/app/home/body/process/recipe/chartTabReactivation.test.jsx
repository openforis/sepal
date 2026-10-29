import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {actionBuilder} from '~/action-builder'
import {Recipe} from '~/app/home/body/process/recipeContext'
import {initStore} from '~/store'
import {TabContent} from '~/widget/tabs/tabContent'

// A pixel chart's panel is not displayed while its recipe's tab is not selected (panel.jsx), and Dygraph sizes a chart by
// its element when it is built: one built there would keep a size it never leaves. A chart whose data arrives while
// its tab is not selected is drawn once the tab is selected again, from the data received, without asking for it again.
// The tab, recipe, chart panel, graph and Redux are real; Earth Engine and the canvas renderer (Dygraph) are substitutes.

const {loadCCDCSegments$, loadTimeSeriesObservations$} = vi.hoisted(() => ({
    loadCCDCSegments$: vi.fn(),
    loadTimeSeriesObservations$: vi.fn()
}))
vi.mock('~/apiRegistry', () => ({default: {gee: {loadCCDCSegments$, loadTimeSeriesObservations$}}}))
vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
// What each chart was built with, and whether its panel was hidden (`disabled`, display: none) when it was.
const drawn = vi.hoisted(() => [])
vi.mock('dygraphs', () => ({
    default: class {
        constructor(element, data) {
            drawn.push({data, hidden: Boolean(element.closest('[class*=disabled]'))})
        }

        updateOptions() {}
    }
}))

const {ChartPixel: TimeSeriesChart} = await import('./timeSeries/panels/chartPixel')
const {ChartPixel: CcdcChart} = await import('./ccdc/panels/chartPixel')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container

beforeEach(() => {
    drawn.length = 0
    loadCCDCSegments$.mockReset()
    loadTimeSeriesObservations$.mockReset()
})

afterEach(() => {
    act(() => root?.unmount())
    root = null
    container?.remove()
})

for (const {chart, Chart, recipe, load$, received, respond} of [
    {
        chart: 'Time Series',
        Chart: TimeSeriesChart,
        recipe: () => recipeOf('TIME_SERIES'),
        load$: loadTimeSeriesObservations$,
        received: OBSERVATIONS(),
        respond: (pending, observations) => pending.next(observations)
    },
    {
        chart: 'CCDC',
        Chart: CcdcChart,
        recipe: () => recipeOf('CCDC'),
        load$: loadCCDCSegments$,
        received: SEGMENTS(),
        respond: (pending, segments) => pending.next(segments)
    }
]) {
    describe(`a ${chart} pixel chart`, () => {
        beforeEach(() => {
            loadTimeSeriesObservations$.mockReturnValue(new Subject())
            loadCCDCSegments$.mockReturnValue(new Subject())
        })

        it('whose data arrives while its tab is not selected is drawn once the tab is selected again, without asking again', () => {
            const pending = new Subject()
            load$.mockReturnValueOnce(pending)
            open(Chart, recipe())
            const requests = load$.mock.calls.length

            selectTab(false)
            act(() => respond(pending, received))
            expect(drawn).toEqual([])

            selectTab(true)
            expect(drawn).toHaveLength(1)
            expect(drawn[0].hidden).toBe(false)
            expect(drawn[0].data.length).toBeGreaterThan(0)
            expect(load$.mock.calls.length).toBe(requests)
        })

        it('drawn while its tab is selected is neither drawn nor asked for again as the tab is left and selected again', () => {
            const pending = new Subject()
            load$.mockReturnValueOnce(pending)
            open(Chart, recipe())
            act(() => respond(pending, received))
            expect(drawn).toHaveLength(1)
            const requests = load$.mock.calls.length

            selectTab(false)
            selectTab(true)

            expect(drawn).toHaveLength(1)
            expect(load$.mock.calls.length).toBe(requests)
        })
    })
}

const ID = 'chart-recipe'
const PIXEL = {lat: 0, lng: 0}

function OBSERVATIONS() {
    return {
        features: [
            {properties: {date: {value: Date.UTC(2020, 0, 1)}, value: 0.5}},
            {properties: {date: {value: Date.UTC(2020, 6, 1)}, value: 0.6}}
        ]
    }
}

// One segment over the chart's period, in fractional years (dateFormat 1), with constant NDVI.
function SEGMENTS() {
    return {
        tStart: [2019.0], tEnd: [2021.0], tBreak: [0], changeProb: [0], numObs: [20],
        ndvi_coefs: [[0.5, 0, 0, 0, 0, 0, 0, 0]], ndvi_rmse: [0.01], ndvi_magnitude: [0]
    }
}

// Over Landsat 8 scenes, charting NDVI.
function recipeOf(type) {
    return {
        id: ID,
        type,
        model: {
            dates: {startDate: '2019-01-01', endDate: '2021-01-01'},
            sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, breakpointBands: ['ndvi']},
            options: {corrections: ['SR']},
            ccdcOptions: {dateFormat: 1}
        },
        ui: {chartPixel: null}
    }
}

const render = (Chart, selected) => (
    <Provider store={store}>
        <TabContent id={ID} type='recipe' selected={selected} busyIn$={new Subject()} tabBusy$={() => new Subject()}>
            {() => (
                <Recipe id={ID}>
                    <Chart values={{selectedBand: 'ndvi'}}/>
                </Recipe>
            )}
        </TabContent>
    </Provider>
)

let store, currentChart

const open = (Chart, recipe) => {
    const initialState = {
        dimensions: {width: 1024, height: 768},
        process: {loadedRecipes: {[ID]: recipe}, tabs: [{id: ID}], recipes: []}
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    currentChart = Chart
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root.render(render(Chart, true)))
    act(() => actionBuilder('CHART_PIXEL').set(['process.loadedRecipes', ID, 'ui.chartPixel'], PIXEL).dispatch())
}

// The recipe's tab selected, or another tab selected instead.
const selectTab = selected => {
    act(() => root.render(render(currentChart, selected)))
}
