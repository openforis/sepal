import Papa from 'papaparse'
import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {of, Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {assetProcessing} from '#sepal/recipe/changeAlerts/processing'
import {actionBuilder} from '~/action-builder'
import {Recipe} from '~/app/home/body/process/recipeContext'
import {initStore} from '~/store'
import {PortalContainer, PortalContext} from '~/widget/portal'

// Each pixel chart's Export CSV, through its panel's button, over a real store, recipe, panel, chart and Graph widget.
// Earth Engine, the canvas renderer (Dygraph), the band picker and the browser's download are substitutes.

const gee = vi.hoisted(() => ({
    loadTimeSeriesObservations$: vi.fn(),
    loadCCDCSegments$: vi.fn(),
    loadLandTrendrSegments$: vi.fn()
}))
vi.mock('~/apiRegistry', () => ({default: {gee}}))
vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
// What the browser is given to save.
const downloads = vi.hoisted(() => [])
vi.mock('~/widget/download', () => ({
    download: () => {},
    downloadObject: (blob, filename) => downloads.push({blob, filename})
}))
// A chart as Dygraph holds it, zoomed as its range selector zooms it.
const charts = vi.hoisted(() => [])
vi.mock('dygraphs', () => ({
    default: class {
        static Plotters = {fillPlotter() {}, errorPlotter() {}, linePlotter() {}}

        constructor(_element, data, options) {
            this.options = {...options, file: data}
            charts.push(this)
        }

        updateOptions(options) {
            Object.assign(this.options, options)
        }

        zoom(dateWindow) {
            this.updateOptions({dateWindow})
            this.options.zoomCallback?.(...dateWindow)
        }
    }
}))
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

const {ChartPixel: TimeSeriesChart} = await import('./timeSeries/panels/chartPixel')
const {ChartPixel: CcdcChart} = await import('./ccdc/panels/chartPixel')
const {ChartPixel: SliceChart} = await import('./ccdcSlice/panels/chartPixel')
const {ChartPixel: ChangeAlertsChart} = await import('./changeAlerts/panels/chartPixel')
const {ChartPixel: LandTrendrChart} = await import('./landTrendr/panels/chartPixel')
const {exportableChart} = await import('./pixelChartExport')
const {ccdcChart} = await import('./ccdc/ccdcChart')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container, store

beforeEach(() => {
    downloads.length = 0
    charts.length = 0
    Object.values(gee).forEach(load$ => load$.mockReset())
})

afterEach(() => {
    act(() => root?.unmount())
    root = null
    container?.remove()
})

describe('a Time Series chart', () => {
    it('exports every observation as read, in time and at its own instant, once they have arrived', async () => {
        const observations = new Subject()
        gee.loadTimeSeriesObservations$.mockReturnValue(observations)
        open(TimeSeriesChart, timeSeries())
        expect(exportButton().disabled).toBe(true)

        answer(observations, {features: [
            feature(Date.UTC(2020, 0, 15, 14, 45, 12, 345), -0.02),
            feature(Date.UTC(2019, 3, 1), 0),
            feature(Date.UTC(2020, 0, 15, 10, 30), 0.41),
            feature(Date.UTC(2020, 0, 15, 10, 30), 0.41)
        ]})
        const recipe = recipeHeld()
        const {rows, filename, columns} = await exported()

        expect(columns).toEqual(OBSERVATION_COLUMNS)
        expect(rows).toEqual([
            observation('2019-04-01T00:00:00.000Z', '0'),
            observation('2020-01-15T10:30:00.000Z', '0.41'),
            observation('2020-01-15T10:30:00.000Z', '0.41'),
            observation('2020-01-15T14:45:12.345Z', '-0.02')
        ])
        expect(filename).toBe('Series_ndvi_12.50000_-3.25000.csv')
        expect(recipeHeld()).toBe(recipe)
    })

    it('exports nothing where the pixel has no observations', () => {
        gee.loadTimeSeriesObservations$.mockReturnValue(of({features: []}))

        open(TimeSeriesChart, timeSeries())

        expect(exportButton().disabled).toBe(true)
    })
})

describe('a CCDC chart', () => {
    it('exports nothing until both its segments and its observations have arrived', () => {
        const [segments, observations] = [new Subject(), new Subject()]
        gee.loadCCDCSegments$.mockReturnValue(segments)
        gee.loadTimeSeriesObservations$.mockReturnValue(observations)
        open(CcdcChart, ccdc())

        answer(segments, segmentsOf('ndvi'))
        expect(charts).toHaveLength(1)
        expect(exportButton().disabled).toBe(true)

        answer(observations, {features: [feature(Date.UTC(2020, 0, 15), 0.5)]})
        expect(exportButton().disabled).toBe(false)
    })

    it('exports each observation it draws one a day of, and the model of every day of its period, fitted or masked', async () => {
        gee.loadCCDCSegments$.mockReturnValue(of(segmentsOf('ndvi')))
        gee.loadTimeSeriesObservations$.mockReturnValue(of({features: [
            feature(Date.UTC(2020, 0, 15, 14, 45), 0.4),
            feature(Date.UTC(2020, 0, 15, 10, 30), 0.6)
        ]}))
        open(CcdcChart, ccdc())
        const recipe = recipeHeld()

        const {rows, columns} = await exported()

        expect(columns).toEqual(MIXED_COLUMNS)
        const modelRows = rows.filter(({series}) => series === 'model')
        expect(rows.filter(({series}) => series === 'observation')).toEqual([
            mixedObservation('2020-01-15T10:30:00.000Z', '0.6'),
            mixedObservation('2020-01-15T14:45:00.000Z', '0.4')
        ])
        expect(modelRows).toHaveLength(731)
        expect([modelRows[0].timestamp, modelRows.at(-1).timestamp]).toEqual(['2019-01-01T00:00:00.000Z', '2020-12-31T00:00:00.000Z'])
        expect(modelRows.find(({timestamp}) => timestamp === '2020-01-15T00:00:00.000Z')).toEqual(
            model('2020-01-15T00:00:00.000Z', {value: '0.5', rmse: '0.05', lower: '0.45', upper: '0.55', model_method: 'fitted'})
        )
        expect(modelRows[0]).toEqual(model('2019-01-01T00:00:00.000Z', {model_method: 'masked'}))
        expect(recipeHeld()).toBe(recipe)
    })

    it('exports its whole period, whatever is zoomed', async () => {
        gee.loadCCDCSegments$.mockReturnValue(of(segmentsOf('ndvi')))
        gee.loadTimeSeriesObservations$.mockReturnValue(of({features: [feature(Date.UTC(2020, 0, 15), 0.5)]}))
        open(CcdcChart, ccdc())
        const unzoomed = await exported()

        act(() => charts.at(-1).zoom([Date.UTC(2020, 0, 1), Date.UTC(2020, 1, 1)]))

        expect(await exported()).toEqual(unzoomed)
    })

    it('exports another band once that is read, never the answer for the band before under its name', async () => {
        const [ndviSegments, ndviObservations, eviObservations] = [new Subject(), new Subject(), new Subject()]
        gee.loadCCDCSegments$.mockReturnValueOnce(ndviSegments).mockReturnValueOnce(of(segmentsOf('evi', 0.25)))
        gee.loadTimeSeriesObservations$.mockReturnValueOnce(ndviObservations).mockReturnValueOnce(eviObservations)
        open(CcdcChart, ccdc())

        chooseBand('evi')
        answer(ndviSegments, segmentsOf('ndvi'))
        answer(ndviObservations, {features: [feature(Date.UTC(2020, 0, 15), 0.5)]})
        expect(exportButton().disabled).toBe(true)

        answer(eviObservations, {features: []})
        const {rows} = await exported()

        expect(new Set(rows.map(({band}) => band))).toEqual(new Set(['evi']))
        expect(rows.find(({timestamp}) => timestamp === '2020-01-15T00:00:00.000Z').value).toBe('0.25')
    })

    it('exports another pixel once that is read', async () => {
        gee.loadCCDCSegments$.mockReturnValue(of(segmentsOf('ndvi')))
        gee.loadTimeSeriesObservations$.mockReturnValue(of({features: [feature(Date.UTC(2020, 0, 15), 0.5)]}))
        open(CcdcChart, ccdc())
        const [segments, observations] = [new Subject(), new Subject()]
        gee.loadCCDCSegments$.mockReturnValue(segments)
        gee.loadTimeSeriesObservations$.mockReturnValue(observations)

        chartAt(ccdc().id, ELSEWHERE)
        expect(exportButton().disabled).toBe(true)
        answer(segments, segmentsOf('ndvi'))
        answer(observations, {features: []})
        const {rows} = await exported()

        expect(new Set(rows.map(({latitude, longitude}) => `${latitude},${longitude}`))).toEqual(new Set(['-1.5,100.125']))
    })

    it('exports nothing where the pixel has neither segments nor observations', () => {
        gee.loadCCDCSegments$.mockReturnValue(of(segmentsOf('ndvi', 0.5, [])))
        gee.loadTimeSeriesObservations$.mockReturnValue(of({features: []}))

        open(CcdcChart, ccdc())

        expect(exportButton().disabled).toBe(true)
    })
})

describe('a CCDC Slice chart', () => {
    it('exports the model between its segments as interpolated, with the uncertainty drawn and no single segment\'s RMSE', async () => {
        const segments = new Subject()
        gee.loadCCDCSegments$.mockReturnValue(segments)
        open(SliceChart, slice())
        expect(exportButton().disabled).toBe(true)

        answer(segments, {
            tStart: [2019.0, 2020.0], tEnd: [2019.5, 2020.5], tBreak: [0, 0], changeProb: [0, 0], numObs: [10, 10],
            ndvi_coefs: [[0.2, 0, 0, 0, 0, 0, 0, 0], [0.6, 0, 0, 0, 0, 0, 0, 0]], ndvi_rmse: [0.03, 0.04], ndvi_magnitude: [0, 0]
        })
        const {rows, columns} = await exported()

        const interpolated = rows.filter(({model_method}) => model_method === 'interpolated')
        expect(columns).toEqual(MODEL_COLUMNS)
        expect(runs(rows.map(({model_method}) => model_method))).toEqual(['fitted', 'interpolated', 'fitted'])
        expect(interpolated.length).toBeGreaterThan(150)
        expect(interpolated.every(({rmse, lower, upper, value}) =>
            rmse === '' && Number(lower) < Number(value) && Number(value) < Number(upper))).toBe(true)
        expect(drawnBounds(charts.at(-1), interpolated)).toEqual(interpolated.map(({lower, upper}) => [Number(lower), Number(upper)]))
    })
})

describe('a Change Alerts chart', () => {
    it('exports its observations, and its reference\'s model from the year before calibration, once both have arrived', async () => {
        const [segments, observations] = [new Subject(), new Subject()]
        gee.loadCCDCSegments$.mockReturnValue(segments)
        gee.loadTimeSeriesObservations$.mockReturnValue(observations)
        open(ChangeAlertsChart, changeAlerts())

        answer(segments, {
            tStart: [2023.0], tEnd: [2023.5], tBreak: [0], changeProb: [0], numObs: [40],
            ndvi_coefs: [[0.7, 0, 0, 0, 0, 0, 0, 0]], ndvi_rmse: [0.02], ndvi_magnitude: [0]
        })
        expect(exportButton().disabled).toBe(true)
        answer(observations, {features: [feature(Date.UTC(2023, 11, 10, 10, 12), 0.31)]})
        const {rows, columns} = await exported()

        expect(columns).toEqual(MIXED_COLUMNS)
        const modelRows = rows.filter(({series}) => series === 'model')
        expect(rows.filter(({series}) => series === 'observation')).toEqual([mixedObservation('2023-12-10T10:12:00.000Z', '0.31')])
        expect([modelRows[0], modelRows.at(-1)]).toEqual([
            model('2022-10-01T00:00:00.000Z', {model_method: 'masked'}),
            model('2024-01-02T00:00:00.000Z', {model_method: 'masked'})
        ])
        expect(rows.find(({timestamp}) => timestamp === '2023-01-01T00:00:00.000Z')).toEqual(
            model('2023-01-01T00:00:00.000Z', {value: '0.7', rmse: '0.02', lower: '0.6799999999999999', upper: '0.72', model_method: 'fitted'})
        )
        expect(rows.find(({timestamp}) => timestamp === '2023-12-10T00:00:00.000Z').model_method).toBe('masked')
    })
})

describe('a LandTrendr chart', () => {
    it('exports each year\'s composite and fitted value with the vertices returned, and no date or uncertainty', async () => {
        const segments = new Subject()
        gee.loadLandTrendrSegments$.mockReturnValue(segments)
        open(LandTrendrChart, landTrendr())
        expect(exportButton().disabled).toBe(true)

        answer(segments, {LandTrendr: [[2000, 2001], [-120, 0], [-110, 15], [1, 0]]})
        const recipe = recipeHeld()
        const {rows, columns} = await exported()

        expect(columns).toEqual(ANNUAL_COLUMNS)
        expect(rows).toEqual([
            annual(2000, {series: 'observation', value: '-120'}),
            annual(2000, {series: 'model', value: '-110', is_vertex: 'true'}),
            annual(2001, {series: 'observation', value: '0'}),
            annual(2001, {series: 'model', value: '15', is_vertex: 'false'})
        ])
        expect(recipeHeld()).toBe(recipe)
    })

    it('exports nothing where the pixel has no years', () => {
        gee.loadLandTrendrSegments$.mockReturnValue(of({LandTrendr: [[], [], [], []]}))

        open(LandTrendrChart, landTrendr())

        expect(exportButton().disabled).toBe(true)
    })
})

// Panels let go of what they read as the selection changes; whatever they still hold is not exported under another's.
describe('a chart prepared for a band at a pixel', () => {
    it('is exported only while that band and pixel are the ones selected, and something was read', () => {
        const chart = ccdcChart({band: 'ndvi', latLng: PIXEL, observations: {features: [feature(Date.UTC(2020, 0, 1), 1)]}})

        expect(exportableChart(chart, {band: 'ndvi', latLng: {...PIXEL}})).toBe(chart)
        expect(exportableChart(chart, {band: 'evi', latLng: PIXEL})).toBe(null)
        expect(exportableChart(chart, {band: 'ndvi', latLng: ELSEWHERE})).toBe(null)
        expect(exportableChart({...chart, empty: true}, {band: 'ndvi', latLng: PIXEL})).toBe(null)
    })
})

const PIXEL = {lat: 12.5, lng: -3.25}
const ELSEWHERE = {lat: -1.5, lng: 100.125}
const SEGMENTS_ASSET = 'users/x/segments'

const BLANK_ROW = {
    band: 'ndvi', latitude: '12.5', longitude: '-3.25', value: ''
}

const OBSERVATION_COLUMNS = ['band', 'latitude', 'longitude', 'timestamp', 'value']
const MODEL_COLUMNS = [...OBSERVATION_COLUMNS, 'rmse', 'lower', 'upper', 'model_method']
const MIXED_COLUMNS = [...OBSERVATION_COLUMNS.slice(0, -1), 'series', 'value', 'rmse', 'lower', 'upper', 'model_method']
const ANNUAL_COLUMNS = ['band', 'latitude', 'longitude', 'year', 'series', 'value', 'is_vertex']

const observation = (timestamp, value) => ({...BLANK_ROW, timestamp, value})

const model = (timestamp, values) => ({...BLANK_ROW, timestamp, series: 'model', rmse: '', lower: '', upper: '', model_method: '', ...values})

const mixedObservation = (timestamp, value) => ({...model(timestamp, {}), series: 'observation', value})

const annual = (year, values) => ({...BLANK_ROW, band: 'nbr', year: String(year), is_vertex: '', ...values})

function feature(time, value) {
    return {properties: {date: {value: time}, value}}
}

// One segment, in fractional years, from mid 2019 to mid 2020 with a constant value.
function segmentsOf(band, value = 0.5, tStart = [2019.5]) {
    return {
        tStart, tEnd: tStart.map(t => t + 1), tBreak: tStart.map(() => 0), changeProb: tStart.map(() => 0), numObs: tStart.map(() => 20),
        [`${band}_coefs`]: tStart.map(() => [value, 0, 0, 0, 0, 0, 0, 0]),
        [`${band}_rmse`]: tStart.map(() => 0.05),
        [`${band}_magnitude`]: tStart.map(() => 0)
    }
}

// Over Landsat 8 scenes, charting NDVI.
function timeSeries() {
    return {
        id: 'series-1', type: 'TIME_SERIES', title: 'Series',
        model: {
            dates: {startDate: '2019-01-01', endDate: '2021-01-01'},
            sources: {dataSets: {LANDSAT: ['LANDSAT_8']}},
            options: {corrections: ['SR']}
        }
    }
}

function ccdc() {
    return {
        id: 'ccdc-1', type: 'CCDC', title: 'CCDC',
        model: {
            dates: {startDate: '2019-01-01', endDate: '2021-01-01'},
            sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, breakpointBands: ['ndvi']},
            options: {corrections: ['SR']},
            ccdcOptions: {dateFormat: 1}
        }
    }
}

// Over segments in an asset, described as fitted to NDVI, filling gaps between them by interpolation.
function slice() {
    return {
        id: 'slice-1', type: 'CCDC_SLICE', title: 'Slice',
        model: {
            source: {type: 'ASSET', id: SEGMENTS_ASSET, dateFormat: 1},
            date: {dateType: 'SPECIFIC_DATE', date: '2019-09-01'},
            options: {harmonics: 3, gapStrategy: 'INTERPOLATE', extrapolateSegment: 'CLOSEST', extrapolateMaxDays: 30}
        },
        ui: {sourceEvidence: describedSegments(`ASSET:${SEGMENTS_ASSET}`)}
    }
}

// Alerts over segments in an asset, monitored with Landsat 8 through December 2023.
function changeAlerts() {
    return {
        id: 'alerts-1', type: 'CHANGE_ALERTS', title: 'Alerts',
        model: {
            reference: {type: 'ASSET', id: SEGMENTS_ASSET},
            sources: {band: 'ndvi', dataSetType: 'OPTICAL', dataSets: {LANDSAT: ['LANDSAT_8']}},
            options: {corrections: [], gapStrategy: 'MASK'},
            date: {
                monitoringEnd: '2024-01-01',
                monitoringDuration: 1,
                monitoringDurationUnit: 'months',
                calibrationDuration: 2,
                calibrationDurationUnit: 'months'
            }
        },
        ui: {sourceEvidence: describedSegments(`ASSET:${SEGMENTS_ASSET}`)}
    }
}

function landTrendr() {
    return {id: 'landtrendr-1', type: 'LAND_TRENDR', title: 'Trajectory', model: {sources: {index: 'nbr'}}}
}

function describedSegments(sourceKey) {
    return {
        sourceKey,
        status: 'OBSERVED',
        processing: assetProcessing({dateFormat: 1}),
        segments: {bands: ['ndvi_coefs', 'ndvi_rmse'], baseBands: [{name: 'ndvi', measures: ['value']}], dateFormat: 1}
    }
}

const open = (ChartPixel, recipe) => {
    const initialState = {
        dimensions: {width: 1024, height: 768},
        process: {loadedRecipes: {[recipe.id]: {...recipe, ui: {...recipe.ui, chartPixel: null}}}, tabs: [{id: recipe.id}], recipes: []}
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
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
    chartAt(recipe.id, PIXEL)
}

const chartAt = (recipeId, latLng) => act(() => actionBuilder('CHART_PIXEL')
    .set(['process.loadedRecipes', recipeId, 'ui.chartPixel'], latLng)
    .dispatch())

const recipeHeld = () => Object.values(store.getState().process.loadedRecipes)[0]

const answer = (pending, response) => act(() => {
    pending.next(response)
    pending.complete()
})

const chooseBand = band => act(() => {
    const select = container.querySelector('select[aria-label=band]')
    select.value = band
    select.dispatchEvent(new Event('change', {bubbles: true}))
})

const exportButton = () => [...container.querySelectorAll('button')]
    .find(button => button.textContent.includes('process.chartPixel.exportCsv.label'))

// The rows of the CSV the button downloads, by column.
const exported = async () => {
    expect(exportButton().disabled).toBe(false)
    act(() => exportButton().click())
    const {blob, filename} = downloads.at(-1)
    expect(blob.type).toBe('text/csv;charset=utf-8')
    const {data, meta} = Papa.parse(await blob.text(), {header: true, skipEmptyLines: true})
    return {rows: data, columns: meta.fields, filename}
}

// Consecutive repeats as one.
const runs = values => values.filter((value, index) => value !== values[index - 1])

// The band Dygraph is given to draw either side of each of these rows' values.
const drawnBounds = (chart, rows) => rows.map(({timestamp}) => {
    const [, , [value, uncertainty]] = chart.options.file.find(([date]) => date.toISOString() === timestamp)
    return [value - uncertainty, value + uncertainty]
})
