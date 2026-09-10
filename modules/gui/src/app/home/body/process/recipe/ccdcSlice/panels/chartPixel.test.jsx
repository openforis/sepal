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

import {ChartPixel as CcdcChartPixel} from '../../ccdc/panels/chartPixel'
import {ChartPixel as SliceChartPixel} from './chartPixel'

const {loadCCDCSegments$, loadTimeSeriesObservations$} = vi.hoisted(() => ({
    loadCCDCSegments$: vi.fn(),
    loadTimeSeriesObservations$: vi.fn()
}))
vi.mock('~/apiRegistry', () => ({default: {gee: {loadCCDCSegments$, loadTimeSeriesObservations$}}}))
vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
// The graph renderer is the output boundary; the chart, form, selection widget and Redux are real.
vi.mock('../../ccdc/ccdcGraph', () => ({
    CCDCGraph: ({band, segments}) => <output aria-label='chart'>{JSON.stringify({band, segments})}</output>
}))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container

beforeEach(() => {
    loadCCDCSegments$.mockReset().mockReturnValue(of(['current segments']))
    loadTimeSeriesObservations$.mockReset().mockReturnValue(of([]))
})

afterEach(() => {
    act(() => root?.unmount())
    root = null
    container?.remove()
    vi.restoreAllMocks()
})

describe.each(['CCDC_SLICE', 'CCDC'])('%s chart requests', type => {
    it('replaces an optical selection before requesting radar data and rejects late optical results', () => {
        const optical = recipeWithBands(type, ['ndvi'], 'optical')
        const radar = recipeWithBands(type, ['VV', 'VH'], 'radar')
        const pending = new Subject()
        let cancelled = false
        loadCCDCSegments$.mockReturnValueOnce(pending.pipe(finalize(() => cancelled = true)))
        openChart(optical, 'ndvi')
        expect(loadCCDCSegments$).toHaveBeenCalledTimes(1)
        expect(loadCCDCSegments$.mock.calls[0][0].bands).toEqual(['ndvi'])

        act(() => actionBuilder('CHANGE_SOURCE').set(['process.loadedRecipes', optical.id], radar).dispatch())
        expect(cancelled).toBe(true)
        act(() => {
            pending.next(['obsolete optical segments'])
            pending.complete()
        })

        expect(loadCCDCSegments$.mock.calls.map(([{bands}]) => bands)).toEqual([['ndvi'], ['VV']])
        expect(chart()).toEqual({band: 'VV', segments: ['current segments']})
        if (type === 'CCDC') {
            expect(loadTimeSeriesObservations$.mock.calls.map(([{bands}]) => bands)).toEqual([['ndvi'], ['VV']])
        }
    })
})

describe('a Slice whose source becomes unavailable', () => {
    it('withholds requests and removes the chart when no bands are available', () => {
        const optical = recipeWithBands('CCDC_SLICE', ['ndvi'], 'optical')
        openChart(optical, 'ndvi')
        expect(loadCCDCSegments$).toHaveBeenCalledTimes(1)
        expect(chart().band).toBe('ndvi')

        act(() => actionBuilder('SOURCE_UNAVAILABLE')
            .set(['process.loadedRecipes', optical.id], recipeWithBands('CCDC_SLICE', [], 'unavailable'))
            .dispatch())

        expect(loadCCDCSegments$).toHaveBeenCalledTimes(1)
        expect(container.querySelector('output')).toBeNull()
    })
})

it('replaces a TOA-only CCDC chart band when surface reflectance is enabled', () => {
    const recipe = recipeWithBands('CCDC', ['cirrus'], 'optical')
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

    openChart(recipeWithBands('CCDC', [], 'unavailable'), 'ndvi')

    expect(loadCCDCSegments$).not.toHaveBeenCalled()
    expect(loadTimeSeriesObservations$).not.toHaveBeenCalled()
    expect(container.querySelector('output')).toBeNull()
})

const chart = () => JSON.parse(container.querySelector('output').textContent)

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
    const Chart = recipe.type === 'CCDC_SLICE' ? SliceChartPixel : CcdcChartPixel
    act(() => root.render(
        <Provider store={store}>
            <PortalContainer id='chart-panel'/>
            <PortalContext id='chart-panel'>
                <Recipe id={recipe.id}>
                    <Chart values={{selectedBand}}/>
                </Recipe>
            </PortalContext>
        </Provider>
    ))
    act(() => actionBuilder('CHART_PIXEL')
        .set(['process.loadedRecipes', recipe.id, 'ui.chartPixel'], recipe.ui.chartPixel)
        .dispatch())
}

const recipeWithBands = (type, bands, source) => ({
    id: 'chart-recipe',
    type,
    model: type === 'CCDC_SLICE'
        ? {
            source: {type: 'RECIPE_REF', id: source},
            date: {dateType: 'SINGLE', date: '2020-06-01'},
            options: {gapStrategy: 'INTERPOLATE', harmonics: 3}
        }
        : {
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
