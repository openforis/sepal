import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {finalize, of, Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {assetProcessing, processingOfProducer} from '#sepal/recipe/changeAlerts/processing'
import {actionBuilder} from '~/action-builder'
import {Recipe} from '~/app/home/body/process/recipeContext'
import {initStore} from '~/store'
import {PortalContainer, PortalContext} from '~/widget/portal'

import {SourceRuntimeProvider} from '../../../sourceRuntime/sourceRuntimeContext'
import {ChartPixel} from './chartPixel'

// Samples are interpreted with the description they were taken under. A description arriving for the same
// source is a new one, so what was sampled under the old one is no longer what the chart may draw. The chart is held to
// what its operations need, which the source runtime reads: the reference described, as Earth Engine answers for it.

const {loadCCDCSegments$, loadTimeSeriesObservations$} = vi.hoisted(() => ({
    loadCCDCSegments$: vi.fn(),
    loadTimeSeriesObservations$: vi.fn()
}))
// A segments asset is answered with its bands and the properties it records; a CCDC with what it can be asked for, from
// its catalogue; another recipe with the bands it builds. Tokens never change unless a case says so.
vi.mock('~/apiRegistry', async () => {
    const {of} = await import('rxjs')
    const SEGMENT_BANDS = ['tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb', 'ndvi_coefs', 'ndvi_rmse', 'ndvi_magnitude']
    return {default: {
        gee: {
            loadCCDCSegments$,
            loadTimeSeriesObservations$,
            bands$: ({asset, recipe, includeDataTypes}) => asset
                ? of({bands: SEGMENT_BANDS.map(name => ({name, arrayDimensions: name.endsWith('_coefs') ? 2 : 1})), properties: {dateFormat: 1}})
                : recipe.type === 'CCDC' && !includeDataTypes
                    ? of(SEGMENT_BANDS)
                    : of([{name: 'red', arrayDimensions: 0}]),
            assetVersions$: ({ids}) => of({assets: ids.map(id => ({id, type: 'IMAGE', version: 'v1'}))})
        },
        recipe: {loadAll$: () => of([])}
    }}
})
vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/sources', () => ({
    getAvailableBands: () => ['ndvi'],
    groupedBandOptions: () => [[{value: 'ndvi', label: 'ndvi'}]]
}))
// The graph renderer is the output boundary; the chart, form and Redux are real.
const graph = vi.hoisted(() => ({chart: null}))
vi.mock('../../ccdc/ccdcGraph', () => ({
    CCDCGraph: ({chart}) => {
        graph.chart = chart
        return <output aria-label='chart'/>
    }
}))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ALERTS = 'alerts-1'
const SOURCE = 'RECIPE_REF:masking-1'

let root, container

beforeEach(() => {
    graph.chart = null
    loadCCDCSegments$.mockReset().mockReturnValue(of(CURRENT))
    loadTimeSeriesObservations$.mockReset().mockReturnValue(of({features: []}))
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
    vi.restoreAllMocks()
})

describe('a description accepted for the source being charted', () => {
    it('discards the samples taken under the previous one and asks again', async () => {
        await openChart(described({dateFormat: 1}))
        expect(chart().dateFormat).toBe(1)
        expect(chart().segments).toBe(CURRENT)

        const resampled = noSegments()
        loadCCDCSegments$.mockReturnValue(of(resampled))
        await observe({dateFormat: 2})

        expect(loadCCDCSegments$).toHaveBeenCalledTimes(2)
        expect(chart().dateFormat).toBe(2)
        expect(chart().segments).toBe(resampled)
    })

    it('cancels a request the previous description was still waiting on', async () => {
        const pending = new Subject()
        let cancelled = false
        loadCCDCSegments$.mockReturnValueOnce(pending.pipe(finalize(() => cancelled = true)))
        await openChart(described({dateFormat: 1}))

        await observe({dateFormat: 2})

        expect(cancelled).toBe(true)
        act(() => {
            pending.next(noSegments())
            pending.complete()
        })
        expect(chart().dateFormat).toBe(2)
        expect(chart().segments).toBe(CURRENT)
    })
})

describe('the samples charted', () => {
    it('are kept when the same description is published again', async () => {
        await openChart(described({dateFormat: 1}))

        await observe({dateFormat: 1})

        expect(loadCCDCSegments$).toHaveBeenCalledTimes(1)
    })

    it('are taken again once the asset charted reports a new token, though nothing described changed', async () => {
        await openChart(overAsset({dateFormat: 1}))
        await tokens({[SEGMENTS_ASSET]: {version: 'v1'}})
        expect(loadCCDCSegments$).toHaveBeenCalledTimes(1)

        const resampled = noSegments()
        loadCCDCSegments$.mockReturnValue(of(resampled))
        await tokens({[SEGMENTS_ASSET]: {version: 'v2', changedAt: 1}})

        expect(loadCCDCSegments$).toHaveBeenCalledTimes(2)
        expect(chart().segments).toBe(resampled)
    })
})

// The server derives, and judges, the collection the alerts monitor from the recipe as applied (observedCollection):
// the request names the recipe, its Classification copy and all, rather than settings standing for no recipe.
describe('the observations charted', () => {
    it('are asked for of the alerts recipe as applied', async () => {
        const recipe = withCopiedClassification(described({dateFormat: 1}))

        await openChart(recipe)

        expect(loadTimeSeriesObservations$).toHaveBeenCalledTimes(1)
        expect(loadTimeSeriesObservations$).toHaveBeenCalledWith({
            recipe: expect.objectContaining({id: ALERTS, type: 'CHANGE_ALERTS', model: recipe.model}),
            latLng: {lat: 0, lng: 0},
            bands: ['ndvi']
        })
    })

    it('are asked for again of the recipe once what it monitors is applied changed', async () => {
        await openChart(described({dateFormat: 1}))

        await act(async () => actionBuilder('APPLY_SOURCES')
            .set(['process.loadedRecipes', ALERTS, 'model.sources.dataSets'], {LANDSAT: ['LANDSAT_9']})
            .dispatch())
        await settled()

        expect(loadTimeSeriesObservations$).toHaveBeenCalledTimes(2)
        expect(loadTimeSeriesObservations$.mock.lastCall[0].recipe.model.sources.dataSets).toEqual({LANDSAT: ['LANDSAT_9']})
    })
})

const SEGMENTS_ASSET = 'users/x/segments'

// What the source runtime knows of each asset, for the credentials in effect: none are linked here.
const tokens = async versions => {
    await act(async () => actionBuilder('UPDATE_ASSET_EVIDENCE')
        .set('process.assetEvidence', {
            generation: 0,
            assets: Object.fromEntries(Object.entries(versions).map(([id, {version, changedAt = null}]) => [id, {version, checkedAt: 0, changedAt}]))
        })
        .dispatch())
    await settled()
}

const overAsset = evidence => {
    const recipe = described({...evidence, source: `ASSET:${SEGMENTS_ASSET}`})
    return {...recipe, model: {...recipe.model, reference: {type: 'ASSET', id: SEGMENTS_ASSET}}}
}

const chart = () => graph.chart

// What Earth Engine answers for a pixel where the reference has no segment: each answer its own, told apart by which is
// charted.
function noSegments() {
    return {tStart: [], tEnd: [], tBreak: [], changeProb: [], numObs: []}
}

const CURRENT = noSegments()

const observe = async evidence => {
    await act(async () => actionBuilder('OBSERVED')
        .set(['process.loadedRecipes', ALERTS, 'ui.sourceEvidence'], sourceEvidence(evidence))
        .dispatch())
    await settled()
}

const settled = async () => {
    for (let i = 0; i < 8; i++) {
        await act(async () => {})
    }
}

const sourceEvidence = ({dateFormat, source = SOURCE}) => ({
    sourceKey: source,
    status: 'OBSERVED',
    processing: source.startsWith('ASSET:') ? assetProcessing({dateFormat}) : processingOfProducer({options: {}}),
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
            monitoringDurationUnit: 'months',
            calibrationDuration: 2,
            calibrationDurationUnit: 'months'
        }
    },
    ui: {chartPixel: {lat: 0, lng: 0}, sourceEvidence: sourceEvidence(evidence)}
})

// Sources still carrying the Classification copied from the reference's producer, which Change Alerts does not use.
const withCopiedClassification = recipe =>
    ({...recipe, model: {...recipe.model, sources: {...recipe.model.sources, classification: 'classification-1'}}})

// The Masking the alerts reference, over a CCDC, as the session holds them: it can run.
const REFERENCED = [
    {id: 'masking-1', type: 'MASKING', model: {imageToMask: {type: 'RECIPE_REF', id: 'ccdc-1'}, imageMask: {type: 'RECIPE_REF', id: 'mosaic-1'}}},
    {id: 'mosaic-1', type: 'MOSAIC', model: {}},
    {id: 'ccdc-1', type: 'CCDC', model: {sources: {dataSets: {LANDSAT: ['LANDSAT_8']}}, options: {corrections: []}, dates: {startDate: '2020-01-01', endDate: '2021-01-01'}}}
]

const openChart = async recipe => {
    const initialState = {
        dimensions: {width: 1024, height: 768},
        process: {
            loadedRecipes: {
                [recipe.id]: {...recipe, ui: {...recipe.ui, chartPixel: null}},
                ...Object.fromEntries(REFERENCED.map(record => [record.id, record]))
            },
            tabs: [{id: recipe.id}],
            recipes: []
        }
    }
    const store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(
        <Provider store={store}>
            <SourceRuntimeProvider>
                <PortalContainer id='chart-panel'/>
                <PortalContext id='chart-panel'>
                    <Recipe id={recipe.id}>
                        <ChartPixel values={{selectedBand: 'ndvi'}}/>
                    </Recipe>
                </PortalContext>
            </SourceRuntimeProvider>
        </Provider>
    ))
    await act(async () => actionBuilder('CHART_PIXEL')
        .set(['process.loadedRecipes', recipe.id, 'ui.chartPixel'], recipe.ui.chartPixel)
        .dispatch())
    await settled()
}
