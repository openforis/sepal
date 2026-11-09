import _ from 'lodash'
import React, {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {of, Subject} from 'rxjs'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {actionBuilder} from '~/action-builder'
import {duplicateRecipe, setInitialized} from '~/app/home/body/process/recipe'
import {initializeRecipe} from '~/app/home/body/process/recipeCache'
import {Recipe, recipe as recipeRoot} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {initStore} from '~/store'
import {withActivatable} from '~/widget/activation/activatable'
import {ActivationContext} from '~/widget/activation/activationContext'
import {withActivators} from '~/widget/activation/activator'
import {EventShield} from '~/widget/eventShield'
import {PanelWizard, withPanelWizard} from '~/widget/panelWizard'
import {PortalContainer, PortalContext} from '~/widget/portal'
import {TabContext} from '~/widget/tabs/tabContext'
import {tooltipText} from '~/widget/tooltip.test.fixtures'

// A new recipe's Sources start from the data sets its type prefers, as far as the years its execution reads let them
// contribute: those that may, or else the first of their collection type that may, or else none, to be chosen. The set-up
// wizard proposes them as it first opens Sources, over the dates its earlier steps committed, and commits them only as it
// leaves Sources. Once committed, Sources keep what they hold whatever the dates become, and a recipe already set up -
// loaded or copied - opens with what it holds. The type registrations, their default models and Sources panels, the
// wizard, activation, forms, store and source runtime are real. Each type is also created through its own root, toolbar
// and Dates panel, which render before Sources hold any data set; elsewhere the steps before Sources stand in for AOI and
// Dates, committing the dates their panel would.

const fake = vi.hoisted(() => ({dates: null}))
vi.mock('~/apiRegistry', () => ({default: {
    gee: {
        bands$: () => of([]),
        assetVersions$: ({ids}) => of({assets: ids.map(id => ({id, type: 'IMAGE', version: 'v1'}))}),
        assetMetadata$: () => of({type: 'Image', bands: []})
    },
    recipe: {load$: () => of(null), loadAll$: () => of([]), save$: () => of()}
}}))
vi.mock('~/translate', () => ({msg: (key, values) => {
    const text = [key].flat().join('.')
    return values && Object.keys(values).length ? `${text} ${JSON.stringify(values)}` : text
}}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
vi.mock('~/eventPublisher', () => ({publishEvent: () => {}}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
vi.mock('~/widget/form/assetCombo', () => ({FormAssetCombo: () => null}))
// The roots' maps and their layers: the toolbars and panels are what is looked at. The AOI and Change Alerts' Reference
// panels, which need a map or a reference read, are set-up steps that commit what their panels would.
vi.mock('~/app/home/map/map', async importOriginal => ({...await importOriginal(), Map: ({children}) => children}))
vi.mock('./aoi', async importOriginal => ({...await importOriginal(), Aoi: () => null}))
vi.mock('./recipeImageLayerSource', async importOriginal => ({...await importOriginal(), initializeLayers: () => {}}))
vi.mock('~/app/home/body/process/recipe/mosaic/panels/aoi/aoi', async () => ({Aoi: await stepPanel('aoi')}))
vi.mock('~/app/home/body/process/recipe/changeAlerts/panels/reference/reference', async () => ({Reference: await stepPanel('reference')}))
const stepPanel = vi.hoisted(() => async id => {
    const {compose} = await import('~/compose')
    const {withActivatable} = await import('~/widget/activation/activatable')
    const {withPanelWizard} = await import('~/widget/panelWizard')
    return compose(
        ({panelWizard}) => panelWizard?.next ? <button onClick={panelWizard.next}>{`${id}.next`}</button> : null,
        withActivatable({id, policy: () => ({_: 'disallow'})}),
        withPanelWizard()
    )
})
// A tooltip's text is rendered where it is attached, to be read without hovering.
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, disabled, children}) => !disabled && [msg].flat().map(tooltipText).some(line => typeof line === 'string')
        ? <span data-tooltip={JSON.stringify([msg].flat().map(tooltipText).filter(line => typeof line === 'string'))}>{children}</span>
        : children
}))

const {addRecipeType} = await import('~/app/home/body/process/recipeTypeRegistry')

const L9 = 'LANDSAT_9'
const L8 = 'LANDSAT_8'
const L7 = 'LANDSAT_7'
const TM = 'LANDSAT_TM'
const S2 = 'SENTINEL_2'

// Each type, the Sources panel it sets up, its default model, and the dates its Dates panel commits for the years `from`
// to `to`.
const TYPES = [
    {
        type: 'MOSAIC', registration: await import('./opticalMosaic/opticalMosaic'), panel: await import('./opticalMosaic/panels/sources/sources'),
        defaults: await import('./opticalMosaic/opticalMosaicRecipe'), dataSets: 'process.changeAlerts.panel.sources.form.dataSets.label',
        datesPath: 'dates', datesFor: (from, to) => ({type: 'YEARLY_TIME_SCAN', targetDate: `${from}-07-01`, seasonStart: `${from}-01-01`, seasonEnd: `${to + 1}-01-01`, yearsBefore: 0, yearsAfter: 0}),
        preferred: [L9, L8], firstStep: 'aoi', created: [L9, L8]
    },
    {
        type: 'TIME_SERIES', registration: await import('./timeSeries/timeSeries'), panel: await import('./timeSeries/panels/sources/sources'),
        defaults: await import('./timeSeries/timeSeriesRecipe'), dataSets: 'process.ccdc.panel.sources.form.dataSets.label',
        datesPath: 'dates', datesFor: (from, to) => ({startDate: `${from}-01-01`, endDate: `${to + 1}-01-01`}),
        preferred: [L9, L8, L7, TM], firstStep: 'aoi', created: [L9, L8, L7, TM]
    },
    {
        type: 'CCDC', registration: await import('./ccdc/ccdc'), panel: await import('./ccdc/panels/sources/sources'),
        defaults: await import('./ccdc/ccdcRecipe'), dataSets: 'process.ccdc.panel.sources.form.dataSets.label',
        datesPath: 'dates', datesFor: (from, to) => ({startDate: `${from}-01-01`, endDate: `${to + 1}-01-01`}),
        preferred: [L9, L8, L7, TM], firstStep: 'aoi', created: [L9, L8, L7, TM]
    },
    {
        type: 'PHENOLOGY', registration: await import('./phenology/phenology'), panel: await import('./phenology/panels/sources/sources'),
        defaults: await import('./phenology/phenologyRecipe'), dataSets: 'process.phenology.panel.sources.form.dataSets.label',
        datesPath: 'dates', datesFor: (from, to) => ({fromYear: from, toYear: to}),
        preferred: [L8], firstStep: 'aoi', created: [L8]
    },
    {
        type: 'LANDTRENDR', registration: await import('./landTrendr/landTrendr'), panel: await import('./landTrendr/panels/sources/sources'),
        defaults: await import('./landTrendr/landTrendrRecipe'), dataSets: 'process.landTrendr.panel.sources.form.dataSets.label',
        datesPath: 'dates', datesFor: (from, to) => ({startYear: from, endYear: to}),
        preferred: [L9, L8, L7, TM], firstStep: 'aoi', created: [L9, L8, L7, TM]
    },
    {
        // Monitoring the first half of `to`, calibrated from the start of `from`.
        type: 'CHANGE_ALERTS', registration: await import('./changeAlerts/changeAlerts'), panel: await import('./changeAlerts/panels/sources/sources'),
        defaults: await import('./changeAlerts/changeAlertsRecipe'), dataSets: 'process.changeAlerts.panel.sources.form.dataSets.label',
        datesPath: 'date', datesFor: (from, to) => ({
            monitoringEnd: `${to}-07-01`, monitoringDuration: 6, monitoringDurationUnit: 'months', calibrationDuration: to - from, calibrationDurationUnit: 'years'
        }),
        // Its Date panel starts monitoring months up to today, which Landsat 4-5 never covered.
        preferred: [L9, L8, L7, TM, S2], firstStep: 'reference', created: [L9, L8, L7, S2]
    }
]
TYPES.forEach(({registration}) => addRecipeType(registration.default()))

const ID = 'recipe-1'
const AOI = {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1]]}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container, store, rendered, Root

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
    fake.dates = null
})

describe.each(TYPES)('a new $type', t => {
    it('starts Sources over its default dates with the data sets it prefers', async () => {
        await create(t)

        await setUpToSources()

        expect(chosenOf(t)).toEqual(t.preferred)
        expect(errorsOf(t)).toEqual([])
    })

    it('starts Sources, over historical dates chosen first, with the preferred data sets that may contribute then', async () => {
        await create(t)

        await setUpToSources(t.datesFor(1990, 1995))

        expect(chosenOf(t)).toEqual([TM])
        expect(errorsOf(t)).toEqual([])
    })

    it('commits nothing by opening Sources', async () => {
        await create(t)
        await setUpToSources(t.datesFor(1990, 1995))

        expect(applied().model.sources.dataSets).toBeUndefined()
        expect(applied().ui.initialized).toBeFalsy()
    })

    it('starts Sources empty, to be chosen, where none of their collection type may contribute', async () => {
        await create(t)

        await setUpToSources(t.datesFor(1975, 1980))

        expect(chosenOf(t)).toEqual([])
        expect(enabledOf(t)).toEqual([])
        expect(button('button.done').disabled).toBe(true)
        expect(applied().model.sources.dataSets).toBeUndefined()
    })

    it('leaves an edited draft as edited, and one emptied empty', async () => {
        await create(t)
        await setUpToSources()

        await toggle(t, L8)
        await rerender()
        expect(chosenOf(t)).toEqual(t.preferred.filter(dataSet => dataSet !== L8))

        for (const dataSet of chosenOf(t)) {
            await toggle(t, dataSet)
        }
        await rerender()
        expect(chosenOf(t)).toEqual([])
        expect(button('button.done').disabled).toBe(true)
        expect(applied().model.sources.dataSets).toBeUndefined()
    })
})

// Change Alerts' Sources are finished once a reference offers a band, which is not set up here.
describe.each(TYPES.filter(t => t.type !== 'CHANGE_ALERTS'))('a new $type finishing set-up', t => {
    it('commits what Sources propose as the wizard finishes', async () => {
        await create(t)
        await setUpToSources(t.datesFor(1990, 1995))

        await press('button.done')

        expect(appliedDataSets()).toEqual([TM])
        expect(applied().ui.initialized).toBe(true)
    })

    it('keeps what Sources committed going back, whatever Dates become before returning', async () => {
        await create(t)
        await setUpToSources(t.datesFor(2010, 2022))
        const committed = chosenOf(t)

        await press('button.back')
        await commitDatesAndNext(t.datesFor(2013, 2014))

        expect(appliedDataSets()).toEqual(committed)
        expect(chosenOf(t)).toEqual(committed)
        expect(errorsOf(t)).toEqual([])
        await press('button.done')
        expect(appliedDataSets()).toEqual(committed)
    })

    it('keeps what Sources committed where Dates then leave none able to contribute, holding Done', async () => {
        await create(t)
        await setUpToSources(t.datesFor(2015, 2022))
        const committed = chosenOf(t)

        await press('button.back')
        await commitDatesAndNext(t.datesFor(1990, 1995))

        expect(chosenOf(t)).toEqual(committed)
        expect(errorsOf(t)).toEqual([noOverlap(1990, 1995)])
        expect(button('button.done').disabled).toBe(true)
    })
})

// Through the type's own root, toolbar and Dates panel, over the dates its Dates panel starts with.
describe.each(TYPES)('a new $type created through its own root', t => {
    it('reaches Sources, starting them with the data sets it prefers as far as those dates let them contribute', async () => {
        await createThroughRoot(t)

        await press(`${t.firstStep}.next`)
        await press('button.next')

        expect(chosenOf(t)).toEqual(t.created)
        expect(applied().model.sources.dataSets).toBeUndefined()
    })
})

// Change Alerts' Sources are finished once a reference offers a band, which is not set up here.
describe.each(TYPES.filter(t => t.type !== 'CHANGE_ALERTS'))('a new $type set up through its own root', t => {
    it('finishes set-up holding what Sources proposed', async () => {
        await createThroughRoot(t)
        await press('aoi.next')
        await press('button.next')

        await press('button.done')

        expect(appliedDataSets()).toEqual(t.created)
        expect(applied().ui.initialized).toBe(true)
    })
})

describe('falling back from preferred data sets that may not contribute', () => {
    it.each([
        ['MOSAIC', 1990, 1990, [TM]],
        ['PHENOLOGY', 2005, 2006, [L7]],
        ['PHENOLOGY', 1990, 1991, [TM]]
    ])('a new %s for %s to %s starts with the first optical data set that may', async (type, from, to, expected) => {
        const t = typeOf(type)
        await create(t)

        await setUpToSources(t.datesFor(from, to))

        expect(chosenOf(t)).toEqual(expected)
        expect(errorsOf(t)).toEqual([])
    })
})

describe.each(TYPES)('a $type already set up', t => {
    const OLD_PRESET = [L9, L8, L7, TM]

    it('opens Sources loaded with what it holds, even the data sets new recipes once started with, saying nothing of those the dates exclude while one may contribute', async () => {
        await openSources(t, initializeRecipe(savedRecipe(t, OLD_PRESET, t.datesFor(1990, 1995))))
        const model = applied().model

        expect(chosenOf(t)).toEqual(OLD_PRESET)
        expect(errorsOf(t)).toEqual([])
        expect(button('button.apply')).toBeUndefined()
        expect(applied().model).toBe(model)
    })

    it('opens Sources copied with what the original holds', async () => {
        await open(t, null)
        await act(async () => duplicateRecipe(initializeRecipe(savedRecipe(t, OLD_PRESET, t.datesFor(1990, 1995)))))
        await render(selectFrom(store.getState(), 'process.selectedTabId'))
        await press('sources.open')

        expect(chosenOf(t)).toEqual(OLD_PRESET)
    })

    it('opens Sources holding no data sets with none, for the user to choose', async () => {
        const loaded = initializeRecipe(savedRecipe(t, OLD_PRESET, t.datesFor(1990, 1995)))
        await openSources(t, {...loaded, model: {...loaded.model, sources: _.omit(loaded.model.sources, 'dataSets')}})

        expect(chosenOf(t)).toEqual([])
        expect(applied().model.sources.dataSets).toBeUndefined()
    })
})

// As its Reference panel seeds them on first applying a reference (referenceRequirement.test.jsx).
describe('a new Change Alerts recipe whose reference records the data sets it was fitted from', () => {
    const seeded = dataSets => ({ui: {seededDataSets: dataSets}})

    it('starts Sources with those that may contribute in its calibration and monitoring years', async () => {
        const t = typeOf('CHANGE_ALERTS')
        await create(t, seeded([L8, TM, S2]))

        await setUpToSources(t.datesFor(2000, 2010))

        expect(chosenOf(t)).toEqual([TM])
        expect(applied().model.sources.dataSets).toBeUndefined()
    })

    it('starts Sources with all of them where all may', async () => {
        const t = typeOf('CHANGE_ALERTS')
        await create(t, seeded([L8, TM, S2]))

        await setUpToSources(t.datesFor(2011, 2016))

        expect(chosenOf(t)).toEqual([L8, TM, S2])
    })

    it('starts Sources with the first of their collection type that may where none of them may', async () => {
        const t = typeOf('CHANGE_ALERTS')
        await create(t, seeded([L9]))

        await setUpToSources(t.datesFor(2000, 2010))

        expect(chosenOf(t)).toEqual([L7])
    })
})

const typeOf = type => TYPES.find(t => t.type === type)

const noOverlap = (startYear, endYear) => `process.source.dataSets.noPeriodOverlap ${JSON.stringify({startYear, endYear})}`

const savedRecipe = (t, dataSets, dates) => {
    const {sources, ...model} = _.cloneDeep(t.defaults.defaultModel)
    return {
        id: ID, type: t.type, title: t.type, revision: 1,
        model: {
            ...model, aoi: AOI, [t.datesPath]: dates,
            sources: {...sources, dataSets: _.groupBy(dataSets, dataSet => dataSet.startsWith('SENTINEL') ? 'SENTINEL_2' : 'LANDSAT')}
        }
    }
}

const applied = () => selectFrom(store.getState(), ['process.loadedRecipes', rendered])

const appliedDataSets = () => Object.values(applied().model.sources.dataSets).flat()

const field = label => document.querySelector(`[data-label="${label}"]`)

// The data sets a field offers, by identifier: its buttons but the one marking its errors.
const dataSetButtons = t => [...(field(t.dataSets)?.querySelectorAll('button') || [])]
    .filter(button => !button.closest('[data-feedback]') && button.textContent)

const idOf = button => button.textContent.replace(/^sources\.dataSets\.|\.label$/g, '')

const chosenOf = t => dataSetButtons(t).filter(({className}) => /_highlight_/.test(className)).map(idOf)

const enabledOf = t => dataSetButtons(t).filter(({disabled}) => !disabled).map(idOf)

// What a field's label says of it as errors: the tooltip of the icon marking them.
const errorsOf = t => {
    const tooltip = field(t.dataSets)?.querySelector('[data-feedback="error"]')?.closest('[data-tooltip]')
    return tooltip ? JSON.parse(tooltip.dataset.tooltip) : []
}

const button = label => [...document.querySelectorAll('button')].find(button => button.textContent === label)

const press = async label => {
    expect(button(label), `no button ${label}`).toBeDefined()
    await act(async () => button(label).click())
    await settled()
}

const toggle = async (t, dataSet) => {
    const option = dataSetButtons(t).find(button => idOf(button) === dataSet)
    expect(option, `no data set ${dataSet}`).toBeDefined()
    await act(async () => option.click())
    await settled()
}

// A store change the panel renders again for, unrelated to its fields.
const rerender = async () => {
    await act(async () => actionBuilder('UNRELATED').set(['process', 'unrelated'], Date.now()).dispatch())
    await settled()
}

// The wizard led through AOI and Dates to Sources, Dates committing `dates` where given.
const setUpToSources = async dates => {
    await press('aoi.next')
    await commitDatesAndNext(dates)
}

const commitDatesAndNext = async dates => {
    fake.dates = dates
    await press('dates.next')
}

// A set-up step before Sources: open while the wizard has it as its step, committing what its panel would on Next.
const step = (id, commit = () => {}) => compose(
    ({panelWizard}) => (
        <section data-panel={id}>
            {panelWizard?.next && <button onClick={() => {
                commit()
                panelWizard.next()
            }}>{`${id}.next`}</button>}
        </section>
    ),
    withActivatable({id, policy: () => ({_: 'disallow'})}),
    withPanelWizard()
)

const AoiStep = step('aoi')

// Sources' toolbar button, for a recipe already set up.
const SourcesButton = compose(
    ({activator: {activatables: {sources}}}) => <button onClick={() => sources.activate()}>sources.open</button>,
    withActivators('sources')
)

// As created (createRecipe.jsx): a tab, a recipe of the type without a model, and the root giving it its default model.
async function create(t, {ui = {}} = {}) {
    await open(t, {id: ID, type: t.type, placeholder: t.type, ui: {unsaved: true, ...ui}})
}

async function open(t, recipe) {
    const loadedRecipes = recipe ? {[recipe.id]: recipe} : {}
    const initialState = {
        dimensions: {width: 1024, height: 768},
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes,
            recipes: recipe ? [{id: recipe.id, name: recipe.id, type: recipe.type, revision: 1}] : [],
            recipeListing: {checkedAt: Date.now()},
            saveStates: {},
            projects: [],
            tabs: recipe ? [{id: recipe.id, type: recipe.type}] : [],
            selectedTabId: recipe?.id
        }
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    Root = setUpRoot(t)
    rendered = recipe?.id
    if (recipe) {
        await render(recipe.id)
    }
}

// As created, under the type's own root, which gives it its default model and runs its set-up wizard in its toolbar.
async function createThroughRoot(t) {
    await open(t, null)
    Root = t.registration.default().components.recipe
    await act(async () => actionBuilder('CREATE_RECIPE')
        .set(['process.loadedRecipes', ID], {id: ID, type: t.type, placeholder: t.type, ui: {unsaved: true}})
        .set(['process.tabs'], [{id: ID, type: t.type}])
        .dispatch())
    await render(ID)
}

// A recipe already set up, its Sources opened from the toolbar.
async function openSources(t, recipe) {
    await open(t, recipe)
    await press('sources.open')
}

// The type's root as set-up runs it: its default model given where the recipe has none, and the wizard over AOI, Dates
// and Sources until done.
const setUpRoot = t => recipeRoot({
    defaultModel: {..._.cloneDeep(t.defaults.defaultModel), aoi: AOI},
    mapRecipeToProps: recipe => ({initialized: selectFrom(recipe, 'ui.initialized')})
})(({recipeId, initialized}) => {
    const DatesStep = React.useMemo(() => step('dates', () => fake.dates && actionBuilder('APPLY_DATES')
        .set(['process.loadedRecipes', recipeId, 'model', t.datesPath], fake.dates)
        .dispatch()), [recipeId])
    const Sources = t.panel.Sources
    return (
        <PanelWizard panels={['aoi', 'dates', 'sources']} initialized={initialized} onDone={() => setInitialized(recipeId)}>
            <AoiStep/>
            <DatesStep/>
            <Sources/>
            {initialized ? <SourcesButton/> : null}
        </PanelWizard>
    )
})

async function render(recipeId) {
    rendered = recipeId
    await act(async () => root.render(
        <Provider store={store}>
            <SourceRuntimeProvider>
                <PortalContainer/>
                <PortalContainer id='test-portal'/>
                <PortalContext id='test-portal'>
                    <EventShield>
                        <ActivationContext id='root'>
                            <Recipe id={recipeId}>
                                <TabContext id={recipeId} busyIn$={new Subject()}>
                                    <Root/>
                                </TabContext>
                            </Recipe>
                        </ActivationContext>
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
