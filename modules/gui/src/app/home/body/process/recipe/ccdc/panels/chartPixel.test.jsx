import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {finalize, of, Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {actionBuilder} from '~/action-builder'
import {Recipe} from '~/app/home/body/process/recipeContext'
import * as sources from '~/sources'
import {initStore} from '~/store'
import {PortalContainer, PortalContext} from '~/widget/portal'

import {ChartPixel} from './chartPixel'

const {loadCCDCSegments$, loadTimeSeriesObservations$} = vi.hoisted(() => ({
    loadCCDCSegments$: vi.fn(),
    loadTimeSeriesObservations$: vi.fn()
}))
vi.mock('~/apiRegistry', () => ({default: {gee: {loadCCDCSegments$, loadTimeSeriesObservations$}}}))
vi.mock('~/translate', () => ({msg: key => key}))
// The graph renderer is the output boundary; the chart, form, selection widget and Redux are real.
const graph = vi.hoisted(() => ({chart: null}))
vi.mock('../ccdcGraph', () => ({
    CCDCGraph: ({chart}) => {
        graph.chart = chart
        return <output aria-label='chart'/>
    }
}))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container

beforeEach(() => {
    graph.chart = null
    loadCCDCSegments$.mockReset().mockReturnValue(of(CURRENT))
    loadTimeSeriesObservations$.mockReset().mockReturnValue(of({features: []}))
})

afterEach(() => {
    act(() => root?.unmount())
    root = null
    container?.remove()
    vi.restoreAllMocks()
})

// CCDC Slice's chart is held to its source's requirements, and covered with them (ccdcSlice/sourceRequirement.test.jsx).
describe('CCDC chart requests', () => {
    it('replaces an optical selection before requesting radar data and rejects late optical results', () => {
        const optical = recipeWithBands(['ndvi'], 'optical')
        const radar = recipeWithBands(['VV', 'VH'], 'radar')
        const pending = new Subject()
        let cancelled = false
        loadCCDCSegments$.mockReturnValueOnce(pending.pipe(finalize(() => cancelled = true)))
        openChart(optical, 'ndvi')
        expect(loadCCDCSegments$).toHaveBeenCalledTimes(1)
        expect(loadCCDCSegments$.mock.calls[0][0].bands).toEqual(['ndvi'])

        act(() => actionBuilder('CHANGE_SOURCE').set(['process.loadedRecipes', optical.id], radar).dispatch())
        expect(cancelled).toBe(true)
        act(() => {
            pending.next(noSegments())
            pending.complete()
        })

        expect(loadCCDCSegments$.mock.calls.map(([{bands}]) => bands)).toEqual([['ndvi'], ['VV']])
        expect(chart().band).toBe('VV')
        expect(chart().segments).toBe(CURRENT)
        expect(loadTimeSeriesObservations$.mock.calls.map(([{bands}]) => bands)).toEqual([['ndvi'], ['VV']])
    })
})

it('replaces a TOA-only CCDC chart band when surface reflectance is enabled', () => {
    const recipe = recipeWithBands(['cirrus'], 'optical')
    openChart(recipe, 'cirrus')
    expect(loadCCDCSegments$).toHaveBeenCalledTimes(1)
    expect(loadCCDCSegments$.mock.calls[0][0].bands).toEqual(['cirrus'])

    act(() => actionBuilder('ENABLE_SURFACE_REFLECTANCE')
        .set(['process.loadedRecipes', recipe.id, 'model.options.corrections'], ['SR'])
        .dispatch())

    expect(loadCCDCSegments$.mock.calls.map(([{bands}]) => bands)).toEqual([['cirrus'], ['ndvi']])
    expect(loadTimeSeriesObservations$.mock.calls.map(([{bands}]) => bands)).toEqual([['cirrus'], ['ndvi']])
    expect(chart().band).toBe('ndvi')
})

it('withholds both CCDC requests when its band provider reports no available bands', () => {
    vi.spyOn(sources, 'getAvailableBands').mockReturnValue([])

    openChart(recipeWithBands([], 'unavailable'), 'ndvi')

    expect(loadCCDCSegments$).not.toHaveBeenCalled()
    expect(loadTimeSeriesObservations$).not.toHaveBeenCalled()
    expect(container.querySelector('output')).toBeNull()
})

const chart = () => graph.chart

// What Earth Engine answers for a pixel where CCDC found no segment: each answer its own, told apart by which is charted.
function noSegments() {
    return {tStart: [], tEnd: [], tBreak: [], changeProb: [], numObs: []}
}

const CURRENT = noSegments()

const openChart = (recipe, selectedBand) => {
    const initialState = {
        dimensions: {width: 1024, height: 768},
        process: {
            loadedRecipes: {[recipe.id]: {...recipe, ui: {...recipe.ui, chartPixel: null}}},
            tabs: [{id: recipe.id}], recipes: []
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
                    <ChartPixel values={{selectedBand}}/>
                </Recipe>
            </PortalContext>
        </Provider>
    ))
    act(() => actionBuilder('CHART_PIXEL')
        .set(['process.loadedRecipes', recipe.id, 'ui.chartPixel'], recipe.ui.chartPixel)
        .dispatch())
}

const recipeWithBands = (bands, source) => ({
    id: 'chart-recipe',
    type: 'CCDC',
    model: {
        dates: {startDate: '2019-01-01', endDate: '2021-01-01'},
        sources: {dataSets: bands.length ? (source === 'radar' ? {SENTINEL_1: ['SENTINEL_1']} : {LANDSAT: ['LANDSAT_8']}) : {}},
        ccdcOptions: {dateFormat: 1}
    },
    ui: {
        chartPixel: {lat: 0, lng: 0},
        sourceEvidence: {
            sourceKey: `RECIPE_REF:${source}`,
            status: 'OBSERVED',
            segments: {baseBands: bands.map(name => ({name})), dateFormat: 1}
        }
    }
})
