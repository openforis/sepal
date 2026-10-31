import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {actionBuilder} from '~/action-builder'
import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {initStore} from '~/store'
import {PortalContainer, PortalContext} from '~/widget/portal'

// The bands a Time Series or CCDC chart offers of the Classification its Sources select, where the session does not
// hold that record: as the source runtime read it for the chart's own readiness, while that answer is current, not as
// Sources copied it when it was selected. A copy taken while it regressed does not offer the regression an SVM it has
// since become does not provide, so it is never requested. The registrations, runtime, readiness, band rules and chart
// are real; Earth Engine, storage, the graph renderer and the band picker's widget are replaced.

const fake = vi.hoisted(() => ({stored: {}, listing: [], loads: [], observations: []}))
vi.mock('~/apiRegistry', () => ({default: {
    gee: {
        loadTimeSeriesObservations$: ({bands}) => {
            fake.observations.push(bands)
            return of({features: []})
        },
        loadCCDCSegments$: () => of([]),
        assetVersions$: ({ids}) => of({assets: ids.map(id => ({id, type: 'IMAGE', version: 'v1'}))}),
        bands$: () => of(['red', 'nir'].map(name => ({name, arrayDimensions: 0})))
    },
    recipe: {
        load$: id => {
            fake.loads.push(id)
            return of(fake.stored[id])
        },
        loadAll$: () => of(fake.listing)
    }
}}))
vi.mock('~/translate', () => ({msg: key => (Array.isArray(key) ? key.join('.') : key)}))
vi.mock('~/user', () => ({}))
vi.mock('~/eventPublisher', () => ({publishEvent: () => {}}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
vi.mock('./ccdc/ccdcGraph', () => ({CCDCGraph: () => null}))
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
const {default: ccdc} = await import('./ccdc/ccdc')
const {default: timeSeries} = await import('./timeSeries/timeSeries')
const {ChartPixel: CcdcChartPixel} = await import('./ccdc/panels/chartPixel')
const {ChartPixel: TimeSeriesChartPixel} = await import('./timeSeries/panels/chartPixel')

addRecipeType(ccdc())
addRecipeType(timeSeries())

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, store

beforeEach(() => {
    fake.stored = {[CLASSIFICATION]: classificationOf(SVM)}
    fake.listing = listingAt(1)
    fake.loads = []
    fake.observations = []
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
})

describe.each([
    ['TIME_SERIES', TimeSeriesChartPixel],
    ['CCDC', CcdcChartPixel]
])('a %s chart over a Classification the session does not hold', (type, ChartPixel) => {
    it('offers, and requests, no output the stored Classification no longer provides, though Sources copied it when it did', async () => {
        await openChart(type, ChartPixel)

        expect(offered()).not.toContain('regression')
        expect(offered()).toContain('probability_1')
        expect(fake.observations).toHaveLength(1)
        expect(fake.observations).not.toContainEqual(['regression'])
    })

    it('offers the Classification as the session holds it once it does, whatever was read for the chart', async () => {
        await openChart(type, ChartPixel)

        await holdInSession(classificationOf(RANDOM_FOREST))

        expect(offered()).toContain('regression')
    })

    it('offers it as storage holds it again once a newer revision is listed, reading it again', async () => {
        await openChart(type, ChartPixel)
        expect(offered()).not.toContain('regression')
        const read = fake.loads.length

        fake.stored = {[CLASSIFICATION]: classificationOf(RANDOM_FOREST, 2)}
        await listRevision(2)

        expect(fake.loads.length).toBeGreaterThan(read)
        expect(offered()).toContain('regression')
    })
})

const ID = 'recipe-1'
const CLASSIFICATION = 'classification-1'
const SVM = {type: 'SVM', svmType: 'C_SVC'}
const RANDOM_FOREST = {type: 'RANDOM_FOREST'}
const LEGEND = {entries: [{value: 1}, {value: 2}]}

// Trained on points of its own: the chart reads only while it can be trained (type/timeSeries.js, ccdc.js).
const classificationOf = (classifier, revision = 1) => ({
    id: CLASSIFICATION,
    type: 'CLASSIFICATION',
    revision,
    model: {
        inputImagery: {images: [{imageId: 'i-1', type: 'ASSET', id: 'users/x/input', bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included: ['red', 'nir']}]}]},
        legend: LEGEND,
        classifier,
        trainingData: {dataSets: [{dataSetId: 'collected', type: 'COLLECTED', referenceData: [{x: 1, y: 1, class: 1}, {x: 2, y: 2, class: 2}]}]}
    }
})

const listingAt = revision => [
    {id: ID, type: 'TIME_SERIES', revision: 1},
    {id: CLASSIFICATION, type: 'CLASSIFICATION', revision}
]

// Sources copied the Classification while it was a Random Forest; the chart was last charting its regression.
const recipeOf = type => ({
    id: ID,
    type,
    revision: 1,
    model: {
        dates: {startDate: '2020-01-01', endDate: '2021-01-01'},
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, breakpointBands: ['ndvi'], classification: CLASSIFICATION},
        options: {corrections: ['SR']},
        opticalPreprocess: {corrections: ['SR']},
        ccdcOptions: {dateFormat: 0}
    },
    ui: {classification: {classificationLegend: LEGEND, classifierType: 'RANDOM_FOREST', classifier: RANDOM_FOREST}}
})

const offered = () => [...document.querySelectorAll('select[aria-label=band] option')].map(({value}) => value)

const settled = async () => {
    for (let i = 0; i < 8; i++) {
        await act(async () => {})
    }
}

const holdInSession = async record => {
    await act(async () => actionBuilder('HOLD').set(['process.loadedRecipes', record.id], record).dispatch())
    await settled()
}

const listRevision = async revision => {
    fake.listing = listingAt(revision)
    await act(async () => actionBuilder('LISTED').set('process.recipes', fake.listing).dispatch())
    await settled()
}

const openChart = async (type, ChartPixel) => {
    const recipe = recipeOf(type)
    const initialState = {
        dimensions: {width: 1024, height: 768},
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: {[ID]: recipe},
            tabs: [{id: ID}],
            saveStates: {},
            recipes: fake.listing,
            recipeListing: {checkedAt: Date.now()},
            folders: []
        }
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(
        <Provider store={store}>
            <SourceRuntimeProvider>
                <PortalContainer id='chart-panel'/>
                <PortalContext id='chart-panel'>
                    <Recipe id={ID}>
                        <ChartPixel values={{selectedBand: 'regression'}}/>
                    </Recipe>
                </PortalContext>
            </SourceRuntimeProvider>
        </Provider>
    ))
    await act(async () => actionBuilder('CHART_PIXEL').set(['process.loadedRecipes', ID, 'ui.chartPixel'], {lat: 1, lng: 2}).dispatch())
    await settled()
}
