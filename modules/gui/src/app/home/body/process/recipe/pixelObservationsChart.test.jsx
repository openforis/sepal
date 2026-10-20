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
// once it is; found unmet, the chart closes and what it was reading is let go, so a late answer draws nothing. It reads
// again whenever what it is computed from changes - a record it depends on included, once storage holds it - and for
// nothing else. The registrations, readiness, store and chart are real; the Earth Engine requests, the graph renderer
// and the band picker's widget are replaced.

// The bands a chart offers: a native one, and the Classification's outputs its classifier supports, as the shared
// capabilities say (supportRegression).
const {loadCCDCSegments$, loadTimeSeriesObservations$, availableBands, flatBandOptions} = vi.hoisted(() => {
    const availableBands = vi.fn()
    return {
        loadCCDCSegments$: vi.fn(),
        loadTimeSeriesObservations$: vi.fn(),
        availableBands,
        flatBandOptions: vi.fn(setting => availableBands(setting).map(band => ({value: band, label: band})))
    }
})
vi.mock('~/apiRegistry', () => ({default: {gee: {loadCCDCSegments$, loadTimeSeriesObservations$}}}))
vi.mock('~/translate', () => ({msg: key => (Array.isArray(key) ? key.join('.') : key)}))
vi.mock('~/user', () => ({}))
vi.mock('~/eventPublisher', () => ({publishEvent: () => {}}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
vi.mock('~/sources', () => ({
    getAvailableBands: setting => availableBands(setting),
    flatBandOptions,
    toDataSetIds: dataSets => dataSets
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
vi.mock('./ccdc/ccdcGraph', () => ({
    CCDCGraph: ({observations}) => <output aria-label='chart'>{JSON.stringify({observations})}</output>
}))

const {supportRegression} = await import('#sepal/recipe/type/classification')
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
    availableBands.mockReset().mockImplementation(({classification} = {}) => [
        'ndvi',
        ...(supportRegression(classification?.classifierType) ? ['regression'] : []),
        'probability_1'
    ])
    flatBandOptions.mockClear()
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

    it('is read again once its classification reads other bands the images can feed, letting go of the earlier read', () => {
        const pending = new Subject()
        let cancelled = false
        loadTimeSeriesObservations$.mockReturnValueOnce(pending.pipe(finalize(() => cancelled = true)))
        openChart(ChartPixel, recipeOf(type), classificationOver(COMPATIBLE))
        loadTimeSeriesObservations$.mockReturnValue(of({features: [CURRENT]}))

        holdClassification(classificationOver(['red', 'nir']))

        expect(cancelled).toBe(true)
        expect(loadTimeSeriesObservations$).toHaveBeenCalledTimes(2)
        act(() => {
            pending.next({features: [STALE]})
            pending.complete()
        })
        expect(charted()).toEqual({features: [CURRENT]})
    })

    it('is read again once its classification\'s classifier settings change', () => {
        openChart(ChartPixel, recipeOf(type), classificationOver(COMPATIBLE, {numberOfTrees: 25}))

        holdClassification(classificationOver(COMPATIBLE, {numberOfTrees: 50}))

        expect(loadTimeSeriesObservations$).toHaveBeenCalledTimes(2)
    })

    it('waits for an edit to its classification to be saved, then reads what storage holds', () => {
        openChart(ChartPixel, recipeOf(type), classificationOver(COMPATIBLE), {classificationOpen: true})
        const edited = classificationOver(['red', 'nir'])

        holdClassification(edited, {status: 'SAVING', revision: 1})
        expect(loadTimeSeriesObservations$).toHaveBeenCalledTimes(1)

        holdClassification(edited, {status: 'SAVED', revision: 2, model: edited.model})
        expect(loadTimeSeriesObservations$).toHaveBeenCalledTimes(2)
    })

    it('is not read again for what it is not computed from', () => {
        openChart(ChartPixel, recipeOf(type), classificationOver(COMPATIBLE))

        act(() => actionBuilder('UNRELATED')
            .set(['process.loadedRecipes', ID, 'title'], 'Renamed')
            .set(['process.loadedRecipes', ID, 'layers'], {areas: {center: {}}})
            .set(['process.loadedRecipes', ID, 'ui.initialized'], true)
            .set(['process.loadedRecipes', ID, 'model.aoi'], {type: 'RECIPE', id: 'another-aoi'})
            .set(['process.loadedRecipes', CLASSIFICATION, 'title'], 'Renamed classification')
            .set(['process.loadedRecipes', 'other-1'], {id: 'other-1', type: 'MOSAIC', model: {}})
            .dispatch())

        expect(loadTimeSeriesObservations$).toHaveBeenCalledTimes(1)
    })

    it('reads the band chosen', () => {
        openChart(ChartPixel, recipeOf(type), classificationOver(COMPATIBLE))

        chooseBand('probability_1')

        expect(loadTimeSeriesObservations$).toHaveBeenCalledTimes(2)
        expect(loadTimeSeriesObservations$.mock.lastCall[0]).toMatchObject({bands: ['probability_1']})
    })

    it('charts another band, reading nothing more of the one charted, once its classification no longer provides it', () => {
        openChart(ChartPixel, recipeOf(type), classificationOver(COMPATIBLE))
        const pending = new Subject()
        let cancelled = false
        loadTimeSeriesObservations$.mockReturnValueOnce(pending.pipe(finalize(() => cancelled = true)))
        chooseBand('regression')

        holdClassification(classificationOver(COMPATIBLE, {type: 'SVM', svmType: 'C_SVC'}))

        expect(cancelled).toBe(true)
        expect(loadTimeSeriesObservations$.mock.calls.map(([{bands}]) => bands)).toEqual([['ndvi'], ['regression'], ['ndvi']])
    })

    it('offers the outputs of its classification as the record holds them, not as copied when it was selected', () => {
        openChart(ChartPixel, recipeOf(type, {copied: {classificationLegend: LEGEND, classifierType: 'RANDOM_FOREST'}}), classificationOver(COMPATIBLE))

        holdClassification(classificationOver(COMPATIBLE, {type: 'SVM', svmType: 'C_SVC'}))

        expect(flatBandOptions.mock.lastCall[0].classification).toMatchObject({classificationLegend: LEGEND, classifierType: 'SVM'})
    })
})

describe('an open CCDC chart', () => {
    it('reads its segments again with its observations once its classification changes', () => {
        openChart(CcdcChartPixel, recipeOf('CCDC'), classificationOver(COMPATIBLE))

        holdClassification(classificationOver(['red', 'nir']))

        expect(loadCCDCSegments$).toHaveBeenCalledTimes(2)
        expect(loadTimeSeriesObservations$).toHaveBeenCalledTimes(2)
    })
})

const ID = 'recipe-1'
const CLASSIFICATION = 'classification-1'
const PIXEL = {lat: 1, lng: 2}
const COMPATIBLE = ['red', 'nir', 'ndvi']
const RADAR_STATISTICS = ['VV_mean', 'VH_med']
const STALE = {properties: {date: {value: 0}, value: 1}}
const CURRENT = {properties: {date: {value: 0}, value: 2}}

const LEGEND = {entries: [{value: 1}, {value: 2}]}

// `copied` is the Classification's legend and classifier as Sources copied them when it was selected.
const recipeOf = (type, {aoi = {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1]]}, copied} = {}) => ({
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
    ui: copied ? {classification: copied} : {}
})

const classificationOver = (included, classifier = {type: 'RANDOM_FOREST'}) => ({
    id: CLASSIFICATION,
    type: 'CLASSIFICATION',
    model: {
        inputImagery: {images: [{imageId: 'i-1', type: 'ASSET', id: 'users/x/input', bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included}]}]},
        legend: LEGEND,
        classifier
    }
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

// The Classification as the session holds it, and where it is being saved, how far its saves have got.
const holdClassification = (classification, saveState) => act(() => actionBuilder('HOLD_CLASSIFICATION')
    .set(['process.loadedRecipes', CLASSIFICATION], classification)
    .set(['process.saveStates', CLASSIFICATION], saveState)
    .dispatch())

const chooseBand = band => act(() => {
    const select = container.querySelector('select[aria-label=band]')
    select.value = band
    select.dispatchEvent(new Event('change', {bubbles: true}))
})

// `classificationOpen`: the Classification is open in a tab of its own, where it is edited and saved.
const openChart = (ChartPixel, recipe, classification, {classificationOpen = false} = {}) => {
    const initialState = {
        dimensions: {width: 1024, height: 768},
        process: {
            loadedRecipes: Object.fromEntries([recipe, classification].filter(Boolean).map(record => [record.id, record])),
            tabs: [{id: recipe.id}, ...(classificationOpen ? [{id: CLASSIFICATION}] : [])],
            saveStates: classificationOpen ? {[CLASSIFICATION]: {status: 'SAVED', revision: 1, model: classification.model}} : {},
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
