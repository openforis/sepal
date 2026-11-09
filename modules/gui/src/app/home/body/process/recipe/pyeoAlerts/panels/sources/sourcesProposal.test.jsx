import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {of} from 'rxjs'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {initStore} from '~/store'
import {EventShield} from '~/widget/eventShield'
import {PortalContainer, PortalContext} from '~/widget/portal'
import {tooltipText} from '~/widget/tooltip.test.fixtures'

// A classification selected in PyEO's Sources proposes data sets, dates and processing together, from what its input
// imagery records (inputImagery.js). The data sets are offered, proposed and judged by the years that proposal monitors -
// the recipe as Apply would save it, its proposed dates and processing included - not the dates it had before: a proposal
// its years let contribute is applied as one, and data sets kept chosen that they do not are refused before anything is
// saved. The panel, its form, its shared requirements, the store and the source runtime are real; recipe and asset reads
// answer from fixtures.

const assetMetadata$ = vi.fn()
const loadRecipe$ = vi.fn()
vi.mock('~/apiRegistry', () => ({default: {
    gee: {
        assetMetadata$: (...args) => assetMetadata$(...args),
        assetVersions$: ({ids}) => of({assets: ids.map(id => ({id, type: 'IMAGE', version: 'v1'}))}),
        bands$: ({asset}) => of(['red', 'nir', 'swir1'].map(name => ({name, arrayDimensions: 0, asset})))
    },
    recipe: {load$: (...args) => loadRecipe$(...args), save$: () => of()}
}}))
vi.mock('~/translate', () => ({msg: (key, values) => {
    const text = [key].flat().join('.')
    return values && Object.keys(values).length ? `${text} ${JSON.stringify(values)}` : text
}}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
vi.mock('~/widget/form/assetCombo', () => ({FormAssetCombo: () => null}))
// A tooltip's text is rendered where it is attached, to be read without hovering.
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, disabled, children}) => !disabled && [msg].flat().map(tooltipText).some(line => typeof line === 'string')
        ? <span data-tooltip={JSON.stringify([msg].flat().map(tooltipText).filter(line => typeof line === 'string'))}>{children}</span>
        : children
}))
vi.mock('~/widget/activation/activatable', () => ({
    withActivatable: () => Component => props => (
        <Component {...props} activatable={{active: true, activate: () => {}, deactivate: () => {}}}/>
    )
}))
// Filled in once the declarations are imported: importing them from within the mock would never resolve.
const registry = vi.hoisted(() => ({}))
vi.mock('~/app/home/body/process/recipeTypeRegistry', () => ({getRecipeType: type => registry[type]}))

const {Sources} = await import('./sources')
const {sourcesRequirements} = await import('../../sourcesRequirements')
registry.PYEO_ALERTS = {id: 'PYEO_ALERTS', sourceRequirements: sourcesRequirements}
registry.CLASSIFICATION = {id: 'CLASSIFICATION'}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ID = 'pyeo-1'
const CLASSIFICATION = 'classification-1'
const INPUT = 'users/x/mosaic'
const TM = 'LANDSAT_TM'
const L8 = 'LANDSAT_8'
const L9 = 'LANDSAT_9'

// Monitoring 2024, as a recipe set up then holds it.
const APPLIED_DATES = {baselineStart: '2023-01-01', baselineEnd: '2024-01-01', monitoringStart: '2024-01-01', monitoringEnd: '2025-01-01', derived: true}

let root, container, store, published

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe('a classification whose imagery is of 1990', () => {
    const imagery = {start: '1990-01-01', end: '1991-01-01', dataSets: {LANDSAT: [TM]}}

    it('proposes its data sets, offering anew only those that may contribute in the year it proposes to monitor', async () => {
        await open({imagery})

        await select(CLASSIFICATION)

        expect(chosen()).toEqual([TM])
        expect(enabled()).toEqual([TM, 'LANDSAT_TM_T2'])
        expect(dataSetErrors()).toEqual([])
    })

    it('applies the proposal as one: its data sets, the dates it monitors and its processing', async () => {
        await open({imagery})
        await select(CLASSIFICATION)
        await chooseChangeClasses()

        await press('button.apply')

        const proposed = {
            dates: {baselineStart: '1990-01-01', baselineEnd: '1991-01-01', monitoringStart: '1991-01-01', monitoringEnd: '1992-01-01', derived: true},
            dataSets: {LANDSAT: [TM]},
            corrections: ['SR']
        }
        expect(model()).toMatchObject({dates: proposed.dates, sources: {classification: CLASSIFICATION, dataSets: proposed.dataSets}, options: {corrections: proposed.corrections}})
        const withSelection = published.filter(({sources}) => sources.classification === CLASSIFICATION)
        expect(withSelection).not.toHaveLength(0)
        withSelection.forEach(({dates, sources, options}) => {
            expect(dates).toEqual(proposed.dates)
            expect(sources.dataSets).toEqual(proposed.dataSets)
            expect(options.corrections).toEqual(proposed.corrections)
        })
    })

    it('refuses data sets kept chosen that may not contribute in the year it proposes, by Apply and Enter, saving nothing', async () => {
        await open({imagery, dataSets: {LANDSAT: [L8]}})
        const saved = model()
        await select(CLASSIFICATION)
        await chooseChangeClasses()

        expect(chosen()).toEqual([L8])
        expect(dataSetErrors()).toEqual([noOverlap(1991, 1991)])
        expect(button('button.apply').disabled).toBe(true)
        await submitByKeyboard()
        expect(model()).toBe(saved)

        await toggle(TM)
        expect(dataSetErrors()).toEqual([])
        await press('button.apply')
        expect(model().sources.dataSets).toEqual({LANDSAT: [L8, TM]})
        expect(model().dates.monitoringStart).toBe('1991-01-01')
    })
})

describe('a classification whose imagery\'s data sets cannot hold imagery in the year it proposes to monitor', () => {
    it('proposes the first optical data set that may', async () => {
        await open({imagery: {start: '2012-01-01', end: '2013-01-01', dataSets: {LANDSAT: [TM]}}})

        await select(CLASSIFICATION)
        await chooseChangeClasses()

        expect(chosen()).toEqual([L8])
        expect(dataSetErrors()).toEqual([])
        await press('button.apply')
        expect(model()).toMatchObject({sources: {dataSets: {LANDSAT: [L8]}}, dates: {monitoringStart: '2013-01-01'}})
    })
})

describe('a classification whose imagery states no dates', () => {
    it('proposes data sets by the dates the recipe monitors', async () => {
        await open({imagery: {dataSets: {LANDSAT: [TM]}}})

        await select(CLASSIFICATION)

        expect(chosen()).toEqual([L9])
        expect(dataSetErrors()).toEqual([])
    })
})

const noOverlap = (startYear, endYear) => `process.source.dataSets.noPeriodOverlap ${JSON.stringify({startYear, endYear})}`

const model = () => store.getState().process.loadedRecipes[ID].model

const field = label => document.querySelector(`[data-label="${label}"]`)

const DATA_SETS = 'process.pyeoAlerts.panel.sources.form.dataSets.label'

const dataSetButtons = () => [...(field(DATA_SETS)?.querySelectorAll('button') || [])]
    .filter(button => !button.closest('[data-feedback]') && button.textContent)

const idOf = button => button.textContent.replace(/^sources\.dataSets\.|\.label$/g, '')

const chosen = () => dataSetButtons().filter(({className}) => /_highlight_/.test(className)).map(idOf)

const enabled = () => dataSetButtons().filter(({disabled}) => !disabled).map(idOf)

const dataSetErrors = () => {
    const tooltip = field(DATA_SETS)?.querySelector('[data-feedback="error"]')?.closest('[data-tooltip]')
    return tooltip ? JSON.parse(tooltip.dataset.tooltip) : []
}

const button = label => [...document.querySelectorAll('button')].find(button => button.textContent === label)

const buttonsLabelled = label => [...document.querySelectorAll('button')].filter(button => button.textContent === label)

const press = async label => {
    expect(button(label), `no button ${label}`).toBeDefined()
    await act(async () => button(label).click())
    await settled()
}

const toggle = async dataSet => {
    const option = dataSetButtons().find(button => idOf(button) === dataSet)
    expect(option, `no data set ${dataSet}`).toBeDefined()
    await act(async () => option.click())
    await settled()
}

const submitByKeyboard = async () => {
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true})))
    await act(async () => document.querySelector('form').dispatchEvent(new Event('submit', {bubbles: true, cancelable: true})))
    await settled()
}

const select = async id => {
    await act(async () => document.querySelector('input').click())
    const option = [...document.querySelectorAll('li')].map(item => item.firstElementChild).find(item => item?.textContent === id)
    expect(option, `no option for ${id}`).toBeDefined()
    await act(async () => option.click())
    await settled()
}

const chooseChangeClasses = async () => {
    await act(async () => buttonsLabelled('Forest')[0].click())
    await act(async () => buttonsLabelled('Non-forest')[1].click())
    await settled()
}

// A trained classification over one asset, whose metadata records the imagery it was exported from: its data sets, its
// processing and, where given, the dates it covers.
const classificationRecord = {
    id: CLASSIFICATION,
    type: 'CLASSIFICATION',
    model: {
        legend: {entries: [{value: 1, label: 'Forest'}, {value: 2, label: 'Non-forest'}]},
        inputImagery: {images: [{imageId: 'i-1', type: 'ASSET', id: INPUT, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included: ['red', 'nir', 'swir1']}]}]},
        classifier: {type: 'RANDOM_FOREST'},
        trainingData: {dataSets: [{dataSetId: 'collected', type: 'COLLECTED', name: 'Collected', referenceData: [{x: 1, y: 1, class: 1}, {x: 2, y: 2, class: 2}]}]}
    }
}

async function open({imagery: {start, end, dataSets}, dataSets: chosenDataSets = {}}) {
    loadRecipe$.mockImplementation(id => of(id === CLASSIFICATION ? classificationRecord : null))
    assetMetadata$.mockImplementation(() => of({
        bandNames: ['red', 'nir', 'swir1'],
        properties: {
            ...(start && {'system:time_start': start, 'system:time_end': end}),
            recipe_sources: JSON.stringify({dataSets}),
            recipe_options: JSON.stringify({corrections: ['SR']})
        }
    }))
    const initialState = {
        dimensions: {width: 1024, height: 768},
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: {
                [ID]: {
                    id: ID,
                    type: 'PYEO_ALERTS',
                    model: {
                        sources: {classification: undefined, dataSets: chosenDataSets, cloudPercentageThreshold: 75, changeFromClasses: [], changeToClasses: []},
                        options: {corrections: []},
                        dates: APPLIED_DATES
                    },
                    ui: {initialized: true}
                },
                [CLASSIFICATION]: classificationRecord
            },
            recipes: [{id: CLASSIFICATION, name: CLASSIFICATION, type: 'CLASSIFICATION', revision: 1}],
            recipeListing: {checkedAt: Date.now()},
            saveStates: {},
            projects: [],
            tabs: []
        }
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    published = []
    store.subscribe(() => store.getState().process.loadedRecipes[ID] && published.push(model()))
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(
        <Provider store={store}>
            <SourceRuntimeProvider>
                <PortalContainer/>
                <PortalContainer id='test-portal'/>
                <PortalContext id='test-portal'>
                    <EventShield>
                        <Recipe id={ID}>
                            <Sources/>
                        </Recipe>
                    </EventShield>
                </PortalContext>
            </SourceRuntimeProvider>
        </Provider>
    ))
    await settled()
}

async function settled() {
    for (let i = 0; i < 8; i++) {
        await act(async () => {})
    }
}
