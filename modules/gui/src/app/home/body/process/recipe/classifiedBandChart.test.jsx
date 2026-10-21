import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {defer, finalize, of, Subject, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {actionBuilder} from '~/action-builder'
import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider, useSourceRuntime} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {MapContext} from '~/app/home/map/mapContext'
import {initStore, select} from '~/store'
import {PortalContainer, PortalContext} from '~/widget/portal'

// A band an open Time Series or CCDC chart reads that its selected Classification computes trains that Classification's
// classifier (the collection classified): while it cannot be trained, or what training it needs is still being read,
// the chart reads nothing for the band, letting go of what it was reading, and stays open - saying why where the
// Classification is found unable - so a band of the images can be chosen; its action, which charts any band, stays
// offered. It reads the band once the Classification can be trained, as storage holds it. A band of the images needs
// nothing of the training. A CCDC reads its segments and observations together, and holds both. What the chart watches
// is what its requests are judged by (loadObservations.test.js, loadSegmentsReadiness.test.js, modules/gee). The
// registrations, store, source runtime, readiness, charts and their action are real; Earth Engine, storage, the map,
// the graph renderer and the toolbar's and band picker's widgets are replaced.

const {loadTimeSeriesObservations$, loadCCDCSegments$, inputBands$, saveRecipe$} = vi.hoisted(() => ({
    loadTimeSeriesObservations$: vi.fn(),
    loadCCDCSegments$: vi.fn(),
    inputBands$: vi.fn(),
    saveRecipe$: vi.fn()
}))
const stored = vi.hoisted(() => ({records: {}}))
vi.mock('~/apiRegistry', () => ({default: {
    gee: {
        loadTimeSeriesObservations$,
        loadCCDCSegments$,
        bands$: ({asset, recipe}) => asset
            ? inputBands$(asset)
            : of(['tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb', 'ndvi_coefs', 'ndvi_rmse', 'ndvi_magnitude'].filter(() => recipe?.type === 'CCDC')),
        assetVersions$: ({ids}) => of({assets: ids.map(id => ({id, type: 'IMAGE', version: 'v1'}))})
    },
    recipe: {load$: id => of(stored.records[id]), loadAll$: () => of(LISTING), save$: request => saveRecipe$(request)}
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
vi.mock('./ccdc/ccdcGraph', () => ({CCDCGraph: () => <output aria-label='graph'/>}))
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

const {addRecipeType} = await import('../recipeTypeRegistry')
const {default: timeSeries} = await import('./timeSeries/timeSeries')
const {default: ccdc} = await import('./ccdc/ccdc')
const {default: classification} = await import('./classification/classification')
const {default: opticalMosaic} = await import('./opticalMosaic/opticalMosaic')
const {RecipeActions: TimeSeriesActions} = await import('./timeSeries/timeSeriesRecipe')
const {RecipeActions: CcdcActions} = await import('./ccdc/ccdcRecipe')
const {ChartPixelButton} = await import('./chartPixelButton')
const timeSeriesChart = await import('./timeSeries/panels/chartPixel')
const ccdcChart = await import('./ccdc/panels/chartPixel')

addRecipeType(timeSeries())
addRecipeType(ccdc())
addRecipeType(classification())
addRecipeType(opticalMosaic())

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const CHARTS = [
    {type: 'TIME_SERIES', chart: timeSeriesChart, RecipeActions: TimeSeriesActions, operations: ['PIXEL_OBSERVATIONS']},
    {type: 'CCDC', chart: ccdcChart, RecipeActions: CcdcActions, operations: ['PIXEL_OBSERVATIONS', 'PIXEL_SEGMENTS']}
]

let root, container, map

beforeEach(() => {
    loadTimeSeriesObservations$.mockReset().mockReturnValue(of({features: []}))
    loadCCDCSegments$.mockReset().mockReturnValue(of([]))
    inputBands$.mockReset().mockReturnValue(of(['red', 'nir'].map(name => ({name, arrayDimensions: 0}))))
    saveRecipe$.mockReset().mockReturnValue(of({revision: 2}))
    watched.length = 0
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe.each(CHARTS)('an open $type chart of a band its Classification computes', chart => {
    it('reads nothing for it while that Classification stores no points, saying so, open at any pixel charted', async () => {
        await open(chart, {trainingData: []})
        await chartAt(PIXEL)

        await chooseBand(CLASSIFIED)

        expect(requested()).toEqual([['ndvi']])
        expect(explained()).toBe(true)
        expect(chartButton().disabled).toBe(false)
        await chartAt(OTHER_PIXEL)
        expect(chartPixel()).toEqual(OTHER_PIXEL)
        expect(requested()).toEqual([['ndvi']])
    })

    it('lets go of what it was reading for it once the Classification stores no points, staying open', async () => {
        await open(chart)
        await chartAt(PIXEL)
        const pending = new Subject()
        let cancelled = false
        loadTimeSeriesObservations$.mockReturnValueOnce(pending.pipe(finalize(() => cancelled = true)))
        await chooseBand(CLASSIFIED)
        expect(requested()).toEqual([['ndvi'], [CLASSIFIED]])

        await holdTrainingData([])

        expect(cancelled).toBe(true)
        expect(requested()).toEqual([['ndvi'], [CLASSIFIED]])
        expect(chartPixel()).toEqual(PIXEL)
        expect(chartButton().disabled).toBe(false)
    })

    it('reads it once, once the Classification stores points again', async () => {
        await open(chart, {trainingData: []})
        await chartAt(PIXEL)
        await chooseBand(CLASSIFIED)

        await holdTrainingData([COLLECTED])

        expect(requested()).toEqual([['ndvi'], [CLASSIFIED]])
        expect(explained()).toBe(false)
    })

    it('reads a band of the images chosen instead', async () => {
        await open(chart, {trainingData: []})
        await chartAt(PIXEL)
        await chooseBand(CLASSIFIED)

        await chooseBand('ndvi')

        expect(requested()).toEqual([['ndvi'], ['ndvi']])
        expect(explained()).toBe(false)
    })

    it('waits for the points it is given to be saved, reading it once storage holds them', async () => {
        await open(chart, {trainingData: [], classificationOpen: true})
        await chartAt(PIXEL)
        await chooseBand(CLASSIFIED)
        const save = new Subject()
        saveRecipe$.mockReturnValueOnce(save)
        const saves = saveRecipe$.mock.calls.length

        await holdTrainingData([COLLECTED])
        await vi.waitFor(() => expect(saveRecipe$.mock.calls.length).toBe(saves + 1))
        await settled()
        expect(requested()).toEqual([['ndvi']])

        await act(async () => {
            save.next({revision: 2})
            save.complete()
        })
        await settled()
        expect(requested().at(-1)).toEqual([CLASSIFIED])
    })
})

describe.each(CHARTS)('an open $type chart of a band its Classification computes over imagery still to be observed', chart => {
    it('reads nothing for it, explaining nothing, until that imagery is observed', async () => {
        const observed = new Subject()
        inputBands$.mockReturnValue(observed)
        await open(chart, {input: ASSET_INPUT, chartedBand: CLASSIFIED})

        await chartAt(PIXEL)
        expect(requested()).toEqual([])
        expect(explained()).toBe(false)

        await act(async () => observed.next(['red', 'nir'].map(name => ({name, arrayDimensions: 0}))))
        await settled()
        expect(requested()).toEqual([[CLASSIFIED]])
    })

    it('reads nothing for it, finding nothing, where that imagery cannot be observed', async () => {
        inputBands$.mockReturnValue(throwError(() => new Error('Earth Engine unreachable')))
        await open(chart, {input: ASSET_INPUT, chartedBand: CLASSIFIED})

        await chartAt(PIXEL)

        expect(requested()).toEqual([])
        expect(explained()).toBe(false)
        expect(chartPixel()).toEqual(PIXEL)
    })

    it('reads a band of the images without waiting for it', async () => {
        inputBands$.mockReturnValue(new Subject())
        await open(chart, {input: ASSET_INPUT})

        await chartAt(PIXEL)

        expect(requested()).toEqual([['ndvi']])
    })
})

describe.each(CHARTS)('what an open $type chart watches', chart => {
    it('is what its requests are judged by: for a band of the images, what any band needs', async () => {
        await open(chart)
        await chartAt(PIXEL)

        expect(watchedOperations()).toEqual(chart.operations)
    })

    it('adds the collection classified for a band its Classification computes, and lets it go with that band and the chart', async () => {
        await open(chart)
        await chartAt(PIXEL)

        await chooseBand(CLASSIFIED)
        expect(watchedOperations()).toEqual([...chart.operations, 'CLASSIFIED_COLLECTION'])

        await chooseBand('ndvi')
        expect(watchedOperations()).toEqual(chart.operations)

        await act(async () => root.unmount())
        root = null
        expect(watched).toEqual([])
    })
})

describe('an open CCDC chart of a band its Classification computes', () => {
    const [, ccdcChartCase] = CHARTS

    it('reads its segments with its observations, and lets go of both, once that Classification stores no points', async () => {
        await open(ccdcChartCase)
        await chartAt(PIXEL)
        const pendingSegments = new Subject()
        let segmentsCancelled = false
        loadCCDCSegments$.mockReturnValueOnce(pendingSegments.pipe(finalize(() => segmentsCancelled = true)))
        await chooseBand(CLASSIFIED)
        expect(segmentsRequested()).toEqual(requested())

        await holdTrainingData([])
        await chooseBand('ndvi')

        expect(segmentsCancelled).toBe(true)
        expect(segmentsRequested()).toEqual([['ndvi'], [CLASSIFIED], ['ndvi']])
        expect(segmentsRequested()).toEqual(requested())
    })

    // A classified breakpoint band is the CCDC's own configuration: every segmentation fits it, whatever band is charted.
    it('closes where a breakpoint band its Classification computes cannot be trained, rather than holding the band', async () => {
        await open(ccdcChartCase, {breakpointBands: ['ndvi', CLASSIFIED]})
        await chartAt(PIXEL)
        await chooseBand(CLASSIFIED)

        await holdTrainingData([])

        expect(chartPixel()).toBe(null)
        expect(chartButton().disabled).toBe(true)
    })

    it('is read over an AOI the session cannot resolve, which classifying the collection does not read', async () => {
        await open(ccdcChartCase, {aoi: {type: 'RECIPE', id: 'aoi-recipe'}, chartedBand: CLASSIFIED})

        await chartAt(PIXEL)

        expect(requested()).toEqual([[CLASSIFIED]])
    })
})

const SERIES = 'series-1'
const CLASSIFICATION = 'classification-1'
const MOSAIC = 'mosaic-1'
const PIXEL = {lat: 1, lng: 2}
const OTHER_PIXEL = {lat: 3, lng: 4}
const CLASSIFIED = 'probability_1'
const LEGEND = {entries: [{id: 'a', value: 1, label: 'A', color: '#000000'}, {id: 'b', value: 2, label: 'B', color: '#ffffff'}]}
const COLLECTED = {dataSetId: 'collected', type: 'COLLECTED', name: 'Collected', referenceData: [{x: 1, y: 1, class: 1}, {x: 2, y: 2, class: 2}]}
const MOSAIC_INPUT = {imageId: 'i-1', type: 'RECIPE_REF', id: MOSAIC, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', class: 'IMAGE_BANDS', included: ['red', 'nir']}]}
const ASSET_INPUT = {imageId: 'i-1', type: 'ASSET', id: 'users/x/input', bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', class: 'IMAGE_BANDS', included: ['red', 'nir']}]}

const LISTING = [
    {id: SERIES, name: 'Series', type: 'TIME_SERIES', revision: 1},
    {id: CLASSIFICATION, name: 'Classification', type: 'CLASSIFICATION', revision: 1},
    {id: MOSAIC, name: 'Mosaic', type: 'MOSAIC', revision: 1}
]

// A Time Series or CCDC over Landsat 8 scenes, its Sources selecting the Random Forest and having copied it when they
// did; a CCDC fitting the breakpoint bands given.
const chartedRecipe = ({type, aoi = {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1]]}, breakpointBands = ['ndvi']}) => ({
    id: SERIES,
    type,
    title: 'Series',
    revision: 1,
    model: {
        aoi,
        dates: {startDate: '2020-01-01', endDate: '2021-01-01'},
        sources: {
            dataSetType: 'OPTICAL', classification: CLASSIFICATION, dataSets: {LANDSAT: ['LANDSAT_8']}, assets: [], cloudPercentageThreshold: 75,
            ...(type === 'CCDC' ? {breakpointBands} : {})
        },
        options: {corrections: ['SR']},
        ...(type === 'CCDC' ? {opticalPreprocess: {corrections: ['SR']}, ccdcOptions: {dateFormat: 1}} : {})
    },
    ui: {initialized: true, classification: {classificationLegend: LEGEND, classifierType: 'RANDOM_FOREST', classifier: {type: 'RANDOM_FOREST'}}}
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

// A Random Forest over `input`, storing the training data given.
const classificationRecipe = ({input, trainingData}) => ({
    id: CLASSIFICATION,
    type: 'CLASSIFICATION',
    title: 'Classification',
    revision: 1,
    model: {
        inputImagery: {images: [input]},
        legend: LEGEND,
        classifier: {type: 'RANDOM_FOREST'},
        trainingData: {dataSets: trainingData}
    },
    ui: {initialized: true}
})

const chartPixel = () => select(['process.loadedRecipes', SERIES, 'ui.chartPixel']) ?? null

const chartButton = () => container.querySelector('button[aria-label=chart]')

const requested = () => loadTimeSeriesObservations$.mock.calls.map(([{bands}]) => bands)

const segmentsRequested = () => loadCCDCSegments$.mock.calls.map(([{bands}]) => bands)

const explained = () => container.textContent.includes('process.chartPixel.classifiedBandWithheld')

// The questions the runtime is asked to read, while they are asked.
const watched = []

// The operations of the questions watched about the recipe charted, by the chart and its action alike.
const watchedOperations = () =>
    [...new Set(watched.filter(({recipeId, operation}) => recipeId === SERIES && operation).map(({operation}) => operation))]

// The runtime the chart and its action are given, its watches recorded.
const RecordingWatches = ({children}) => {
    const runtime = useSourceRuntime()
    if (!runtime.recorded) {
        const watchOutput$ = runtime.watchOutput$
        runtime.recorded = true
        runtime.watchOutput$ = question => defer(() => {
            watched.push(question)
            return watchOutput$(question).pipe(finalize(() => watched.splice(watched.indexOf(question), 1)))
        })
    }
    return children
}

// The pixel is chosen on the map, as the chart's action has it listen for.
const chartAt = async latLng => {
    await act(async () => chartButton().click())
    await act(async () => map.click(latLng))
    await settled()
}

const chooseBand = async band => {
    await act(async () => {
        const select = container.querySelector('select[aria-label=band]')
        select.value = band
        select.dispatchEvent(new Event('change', {bubbles: true}))
    })
    await settled()
}

// The Classification's training data as the session holds it: saved, where it is open, as any edit of it is.
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

// `classificationOpen`: the Classification is open in a tab of its own, where it is edited and saved (saveRecipe$).
async function open({type, chart: {CHART_OPERATIONS, ChartPixel}, RecipeActions}, {
    input = MOSAIC_INPUT, trainingData = [COLLECTED], chartedBand = 'ndvi', classificationOpen = false, aoi, breakpointBands
} = {}) {
    const records = [chartedRecipe({type, aoi, breakpointBands}), classificationRecipe({input, trainingData}), mosaicRecipe()]
    stored.records = Object.fromEntries(records.map(record => [record.id, record]))
    const initialState = {
        dimensions: {width: 1024, height: 768},
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: Object.fromEntries(records.map(record => [record.id, record])),
            recipes: LISTING,
            recipeListing: {checkedAt: Date.now()},
            saveStates: classificationOpen ? {[CLASSIFICATION]: {status: 'SAVED', revision: 1, model: records[1].model}} : {},
            projects: [],
            tabs: [{id: SERIES}, ...(classificationOpen ? [{id: CLASSIFICATION}] : [])]
        }
    }
    const store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    map = mapOf()
    const recipeActions = RecipeActions(SERIES)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(
        <Provider store={store}>
            <SourceRuntimeProvider>
                <RecordingWatches>
                    <MapContext map={map}>
                        <PortalContainer id='chart-panel'/>
                        <PortalContext id='chart-panel'>
                            <Recipe id={SERIES}>
                                <ChartPixelButton operations={CHART_OPERATIONS} onPixelSelected={latLng => recipeActions.setChartPixel(latLng)}/>
                                <ChartPixel values={{selectedBand: chartedBand}}/>
                            </Recipe>
                        </PortalContext>
                    </MapContext>
                </RecordingWatches>
            </SourceRuntimeProvider>
        </Provider>
    ))
    await settled()
    await vi.waitFor(() => expect(saving()).toEqual([]))
}

// The recipes open in a tab whose saves are unacknowledged: on mounting, the session saves what it holds of them.
const saving = () => Object.entries(select('process.saveStates') || {})
    .filter(([_id, {status}]) => status === 'SAVING')
    .map(([id]) => id)

async function settled() {
    for (let i = 0; i < 8; i++) {
        await act(async () => {})
    }
}
