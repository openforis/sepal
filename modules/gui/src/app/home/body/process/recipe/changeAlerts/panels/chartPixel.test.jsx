import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {finalize, of, Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {actionBuilder} from '~/action-builder'
import {Recipe} from '~/app/home/body/process/recipeContext'
import {initStore} from '~/store'
import {PortalContainer, PortalContext} from '~/widget/portal'

import {ChartPixel} from './chartPixel'

// Samples are interpreted with the description they were taken under. A description arriving for the same
// source is a new one, so what was sampled under the old one is no longer what the chart may draw.

const {loadCCDCSegments$, loadTimeSeriesObservations$} = vi.hoisted(() => ({
    loadCCDCSegments$: vi.fn(),
    loadTimeSeriesObservations$: vi.fn()
}))
vi.mock('~/apiRegistry', () => ({default: {gee: {loadCCDCSegments$, loadTimeSeriesObservations$}}}))
vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
vi.mock('~/sources', () => ({
    getAvailableBands: () => ['ndvi'],
    groupedBandOptions: () => [[{value: 'ndvi', label: 'ndvi'}]]
}))
// The graph renderer is the output boundary; the chart, form and Redux are real.
vi.mock('../../ccdc/ccdcGraph', () => ({
    CCDCGraph: ({band, segments, dateFormat}) =>
        <output aria-label='chart'>{JSON.stringify({band, segments, dateFormat})}</output>
}))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ALERTS = 'alerts-1'
const SOURCE = 'RECIPE_REF:masking-1'

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

describe('a description accepted for the source being charted', () => {
    it('discards the samples taken under the previous one and asks again', () => {
        openChart(described({dateFormat: 1, observation: 1}))
        expect(chart()).toMatchObject({dateFormat: 1, segments: ['current segments']})

        loadCCDCSegments$.mockReturnValue(of(['resampled segments']))
        observe({dateFormat: 2, observation: 2})

        expect(loadCCDCSegments$).toHaveBeenCalledTimes(2)
        expect(chart()).toMatchObject({dateFormat: 2, segments: ['resampled segments']})
    })

    it('cancels a request the previous description was still waiting on', () => {
        const pending = new Subject()
        let cancelled = false
        loadCCDCSegments$.mockReturnValueOnce(pending.pipe(finalize(() => cancelled = true)))
        openChart(described({dateFormat: 1, observation: 1}))

        observe({dateFormat: 2, observation: 2})

        expect(cancelled).toBe(true)
        act(() => {
            pending.next(['obsolete segments'])
            pending.complete()
        })
        expect(chart()).toMatchObject({dateFormat: 2, segments: ['current segments']})
    })
})

const chart = () => JSON.parse(container.querySelector('output').textContent)

const observe = evidence => act(() => actionBuilder('OBSERVED')
    .set(['process.loadedRecipes', ALERTS, 'ui.sourceEvidence'], sourceEvidence(evidence))
    .dispatch())

const sourceEvidence = ({dateFormat, observation}) => ({
    sourceKey: SOURCE,
    status: 'OBSERVED',
    observation,
    segments: {bands: ['ndvi_rmse'], baseBands: [{name: 'ndvi', measures: ['value']}], dateFormat}
})

const described = evidence => ({
    id: ALERTS,
    type: 'CHANGE_ALERTS',
    model: {
        reference: {type: 'RECIPE_REF', id: 'masking-1'},
        sources: {band: 'ndvi', dataSetType: 'OPTICAL', dataSets: {LANDSAT: ['LANDSAT_8']}},
        options: {corrections: []},
        date: {
            monitoringEnd: '2024-01-01',
            monitoringDuration: 1,
            monitoringDurationUnit: 'year',
            calibrationDuration: 2,
            calibrationDurationUnit: 'year'
        }
    },
    ui: {chartPixel: {lat: 0, lng: 0}, sourceEvidence: sourceEvidence(evidence)}
})

const openChart = recipe => {
    const initialState = {
        dimensions: {width: 1024, height: 768},
        process: {
            loadedRecipes: {[recipe.id]: {...recipe, ui: {...recipe.ui, chartPixel: null}}},
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
        .set(['process.loadedRecipes', recipe.id, 'ui.chartPixel'], recipe.ui.chartPixel)
        .dispatch())
}
