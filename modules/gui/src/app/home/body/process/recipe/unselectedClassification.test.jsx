import {act, useEffect} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {isClassifiedOutput} from '#sepal/recipe/classifiedOutputs'
import {actionBuilder} from '~/action-builder'
import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {initStore} from '~/store'
import {EventShield} from '~/widget/eventShield'
import {PortalContainer, PortalContext} from '~/widget/portal'

// What a Time Series or CCDC chart, and Time Series Retrieve, offer of a Classification once Sources no longer select
// one: nothing, whatever copy Sources took of the one selected before - the recipe's own view, which clears that copy,
// is not mounted. The selection is cleared, kept or made again in the real Sources panel beside them. The registrations,
// runtime, panels, forms and submission are real; storage, Earth Engine, task submission, the graph renderer, the
// workspace destination's check and the chart's band picker widget are replaced.

const fake = vi.hoisted(() => ({stored: {}, listing: [], requests: [], submitted: []}))
vi.mock('~/apiRegistry', () => ({default: {
    gee: {
        loadTimeSeriesObservations$: ({bands}) => {
            fake.requests.push(bands)
            return of({features: []})
        },
        loadCCDCSegments$: ({bands}) => {
            fake.requests.push(bands)
            return of([])
        },
        assetVersions$: ({ids}) => of({assets: ids.map(id => ({id, type: 'IMAGE', version: 'v1'}))})
    },
    recipe: {
        load$: id => of(fake.stored[id]),
        loadAll$: () => of(fake.listing),
        save$: () => of()
    },
    tasks: {
        submit$: task => {
            fake.submitted.push(task)
            return of(task)
        }
    }
}}))
vi.mock('~/translate', () => ({msg: key => (Array.isArray(key) ? key.join('.') : key)}))
vi.mock('~/user', () => ({isGoogleAccount: () => false}))
vi.mock('~/eventPublisher', () => ({publishEvent: () => {}}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
vi.mock('~/widget/tooltip', () => ({Tooltip: ({children}) => children}))
vi.mock('~/widget/form/assetCombo', () => ({FormAssetCombo: () => null}))
vi.mock('./ccdc/ccdcGraph', () => ({CCDCGraph: () => null}))
vi.mock('~/widget/activation/activatable', () => ({
    withActivatable: () => Component => props => (
        <Component {...props} activatable={{active: true, activate: () => {}, deactivate: () => {}}}/>
    )
}))
vi.mock('~/widget/workspaceDestination', () => ({
    WorkspaceDestination: ({workspacePathInput, onValidityCheckChange}) => {
        useEffect(() => {
            workspacePathInput.set('downloads/series')
            onValidityCheckChange(false)
        }, [])
        return null
    }
}))
// The chart's band picker, the one combo without a label, is a select its offer is read from; the Classification is
// chosen in the real one.
vi.mock('~/widget/form', async importOriginal => {
    const original = await importOriginal()
    const Combo = props => props.label
        ? <original.Form.Combo {...props}/>
        : (
            <select aria-label='band' value={props.input.value || ''} onChange={event => props.input.set(event.target.value)}>
                {props.options.map(({value}) => <option key={value} value={value}>{value}</option>)}
            </select>
        )
    return {...original, Form: {...original.Form, Combo}}
})

const {addRecipeType} = await import('../recipeTypeRegistry')
const {default: ccdc} = await import('./ccdc/ccdc')
const {default: timeSeries} = await import('./timeSeries/timeSeries')
const {ChartPixel: CcdcChartPixel} = await import('./ccdc/panels/chartPixel')
const {Sources: CcdcSources} = await import('./ccdc/panels/sources/sources')
const {ChartPixel: TimeSeriesChartPixel} = await import('./timeSeries/panels/chartPixel')
const {Retrieve} = await import('./timeSeries/panels/retrieve/retrieve')
const {Sources: TimeSeriesSources} = await import('./timeSeries/panels/sources/sources')

addRecipeType(ccdc())
addRecipeType(timeSeries())

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, store

beforeEach(() => {
    fake.stored = {[CLASSIFICATION]: RANDOM_FOREST_CLASSIFICATION}
    fake.listing = LISTING
    fake.requests = []
    fake.submitted = []
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    document.body.innerHTML = ''
})

describe.each([
    {type: 'TIME_SERIES', Sources: TimeSeriesSources, ChartPixel: TimeSeriesChartPixel, label: 'process.timeSeries.panel.sources.form.classification.label'},
    {type: 'CCDC', Sources: CcdcSources, ChartPixel: CcdcChartPixel, label: 'process.ccdc.panel.sources.form.classification.label'}
])('a $type chart charting a regression of the Classification its Sources select', ({type, Sources, ChartPixel, label}) => {
    it('offers and requests no classified output once Sources apply no Classification, charting a band of the images', async () => {
        await openChart({type, Sources, ChartPixel})
        expect(offered()).toContain('regression')
        const requested = fake.requests.length

        await clearClassification(label)
        await press('button.apply')

        expect(savedSources().classification).toBeFalsy()
        expect(offered().filter(isClassifiedOutput)).toEqual([])
        expect(isClassifiedOutput(charted())).toBe(false)
        expect(offered()).toContain(charted())
        const since = fake.requests.slice(requested)
        expect(since.length).toBeGreaterThan(0)
        expect(since.flat().filter(isClassifiedOutput)).toEqual([])
    })

    it('offers its outputs again once Sources apply it selected again', async () => {
        await openChart({type, Sources, ChartPixel})
        await clearClassification(label)
        await press('button.apply')
        await reopenSources()

        await selectClassification(label)
        await press('button.apply')

        expect(savedSources().classification).toBe(CLASSIFICATION)
        expect(offered()).toContain('regression')
    })

    it('keeps offering its outputs when the cleared selection is cancelled', async () => {
        await openChart({type, Sources, ChartPixel})
        await clearClassification(label)

        await press('button.cancel')

        expect(savedSources().classification).toBe(CLASSIFICATION)
        expect(offered()).toContain('regression')
        expect(charted()).toBe('regression')
    })
})

// Saved as a list, or as the value itself where an earlier release offered a single indicator.
describe('Time Series Retrieve asked for a regression of the Classification its Sources select', () => {
    it.each([['a list', ['regression']], ['a single indicator', 'regression']])('stops offering classified outputs once Sources apply no Classification, letting go of the regression to be replaced, saved as %s', async (_case, saved) => {
        await openRetrieve(saved)
        expect(offers(REGRESSION)).toBe(true)

        await clearClassification('process.timeSeries.panel.sources.form.classification.label')
        await press('button.apply')

        expect(offers(REGRESSION)).toBe(false)
        expect(offers(PROBABILITY)).toBe(false)
        await retrieve()
        await submitForm()
        expect(fake.submitted).toEqual([])

        await click(NATIVE)
        await retrieve()
        expect(indicators()).toEqual([[NATIVE]])
    })
})

const ID = 'recipe-1'
const CLASSIFICATION = 'classification-1'
const LEGEND = {entries: [{value: 1, label: 'Forest'}, {value: 2, label: 'Other'}]}
const RANDOM_FOREST = {type: 'RANDOM_FOREST'}
const NATIVE = 'ndvi'
const REGRESSION = 'process.classification.bands.regression'
const PROBABILITY = 'process.classification.bands.probability'

const RANDOM_FOREST_CLASSIFICATION = {
    id: CLASSIFICATION,
    type: 'CLASSIFICATION',
    revision: 1,
    model: {
        inputImagery: {images: [{imageId: 'i-1', type: 'ASSET', id: 'users/x/input', bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included: ['red', 'nir']}]}]},
        legend: LEGEND,
        classifier: RANDOM_FOREST
    }
}

const LISTING = [
    {id: ID, name: ID, type: 'TIME_SERIES', revision: 1},
    {id: CLASSIFICATION, name: CLASSIFICATION, type: 'CLASSIFICATION', revision: 1}
]

// Sources select the Random Forest the session holds, and copied it when they did; Retrieve last asked for `retrieveBands`.
const recipeOf = (type, retrieveBands) => ({
    id: ID,
    type,
    title: 'Series',
    revision: 1,
    model: {
        aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1]]},
        dates: {startDate: '2020-01-01', endDate: '2021-01-01'},
        sources: {dataSetType: 'OPTICAL', dataSets: {LANDSAT: ['LANDSAT_8']}, assets: [], breakpointBands: [NATIVE], classification: CLASSIFICATION},
        options: {corrections: ['SR']},
        opticalPreprocess: {corrections: ['SR']},
        ccdcOptions: {dateFormat: 0}
    },
    ui: {
        initialized: true,
        classification: {classificationLegend: LEGEND, classifierType: RANDOM_FOREST.type, classifier: RANDOM_FOREST},
        retrieve: {bands: retrieveBands, scale: 30, tileSize: 2, shardSize: 256, fileDimensionsMultiple: 2, destination: 'SEPAL', filenamePrefix: 'series'}
    }
})

const savedSources = () => store.getState().process.loadedRecipes[ID].model.sources

const button = (label, within = document) => [...within.querySelectorAll('button')].find(button => button.textContent === label)

const sourcesPanel = () => [...document.querySelectorAll('form')].find(form => form.textContent.includes('panel.sources.title'))

const press = async label => {
    const pressed = button(label, sourcesPanel())
    expect(pressed, `no button ${label} in Sources`).toBeDefined()
    await act(async () => pressed.click())
    await settled()
}

const offered = () => [...document.querySelectorAll('select[aria-label=band] option')].map(({value}) => value)

const charted = () => document.querySelector('select[aria-label=band]').value

const offers = label => !!button(label)

const click = label => act(async () => {
    expect(button(label), `no button labelled ${label}`).toBeDefined()
    button(label).click()
})

const retrieve = async () => {
    await act(async () => button('process.retrieve.apply').click())
    await settled()
}

const submitForm = async () => {
    const form = [...document.querySelectorAll('form')].find(form => form.contains(button('process.retrieve.apply')))
    await act(async () => form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', {cancelable: true})))
    await settled()
}

const indicators = () => fake.submitted.map(({params}) => [].concat(params.image.indicators))

// In Sources, where the classification is chosen under More, and cleared with the control its selector offers.
const clearClassification = async label => {
    button('button.more', sourcesPanel()) && await press('button.more')
    const clear = document.querySelector(`[data-label="${label}"] [data-icon="xmark"]`)?.closest('button')
    expect(clear, 'the classification selector offers no way to clear').toBeTruthy()
    await act(async () => clear.click())
    await settled()
}

const selectClassification = async label => {
    button('button.more', sourcesPanel()) && await press('button.more')
    const input = document.querySelector(`[data-label="${label}"] input`)
    await act(async () => input.click())
    const option = [...document.querySelectorAll('li')].map(item => item.firstElementChild).find(item => item?.textContent === CLASSIFICATION)
    expect(option, `no option for ${CLASSIFICATION}`).toBeDefined()
    await act(async () => option.click())
    await settled()
}

const settled = async () => {
    for (let i = 0; i < 8; i++) {
        await act(async () => {})
    }
}

let chart

const openChart = async ({type, Sources, ChartPixel}) => {
    chart = {Sources, ChartPixel}
    await mount(type, chartPanels('opened'))
    await act(async () => actionBuilder('CHART_PIXEL').set(['process.loadedRecipes', ID, 'ui.chartPixel'], {lat: 1, lng: 2}).dispatch())
    await settled()
}

const chartPanels = opening => {
    const {Sources, ChartPixel} = chart
    return <><Sources key={opening}/><ChartPixel values={{selectedBand: 'regression'}}/></>
}

// Sources closed by Apply, and opened again beside the open chart, from what was applied.
const reopenSources = async () => {
    await act(async () => root.render(rendered(chartPanels('reopened'))))
    await settled()
}

const openRetrieve = retrieveBands => mount('TIME_SERIES', <><TimeSeriesSources/><Retrieve/></>, retrieveBands)

const mount = async (type, panels, retrieveBands = ['regression']) => {
    const initialState = {
        dimensions: {width: 1024, height: 768},
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: {[ID]: recipeOf(type, retrieveBands), [CLASSIFICATION]: RANDOM_FOREST_CLASSIFICATION},
            tabs: [{id: ID}],
            saveStates: {},
            recipes: fake.listing,
            recipeListing: {checkedAt: Date.now()},
            projects: []
        }
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(rendered(panels)))
    await settled()
}

const rendered = panels => (
    <Provider store={store}>
        <SourceRuntimeProvider>
            <PortalContainer/>
            <PortalContainer id='test-portal'/>
            <PortalContext id='test-portal'>
                <EventShield>
                    <Recipe id={ID}>
                        {panels}
                    </Recipe>
                </EventShield>
            </PortalContext>
        </SourceRuntimeProvider>
    </Provider>
)
