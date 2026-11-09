import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {IMAGE_OUTPUT, PIXEL_OBSERVATIONS} from '#sepal/recipe/output/readiness'
import {actionBuilder} from '~/action-builder'
import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider, withSourceRuntime} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {selectFrom} from '~/stateUtils'
import {initStore} from '~/store'
import {EventShield} from '~/widget/eventShield'
import {PortalContainer, PortalContext} from '~/widget/portal'
import {tooltipText} from '~/widget/tooltip.test.fixtures'

// Sources judge the data sets they offer against the years the recipe's execution reads, as its shared type declares
// them (dataSetPeriod). A data set those years exclude cannot be chosen anew; one the draft chooses stays shown and can be
// removed, its tooltip giving the years it holds imagery for, warning of nothing while another chosen may contribute.
// Removed, it is offered again only by Dates its years cover. Where none chosen may, Sources say so beside the data sets and on their section, a draft leaving none
// is refused, and the image is held, until Sources or Dates repair it. The Sources panels, their forms, the store, the type registry and the source runtime are real;
// recipe reads answer from stored records, and Earth Engine is never asked.

const fake = vi.hoisted(() => ({english: false, stored: {}}))
vi.mock('~/apiRegistry', () => ({default: {
    gee: {
        bands$: () => of([]),
        assetVersions$: ({ids}) => of({assets: ids.map(id => ({id, type: 'IMAGE', version: 'v1'}))}),
        assetMetadata$: () => of({type: 'Image', bands: []})
    },
    recipe: {
        load$: id => of(fake.stored[id] ?? null),
        loadAll$: () => of([]),
        save$: () => of()
    }
}}))
// A message is its key and values; in English, the real one says it from the catalogue.
vi.mock('~/translate', async importOriginal => {
    const actual = await importOriginal()
    return {...actual, msg: (key, values, defaultMessage) => {
        if (fake.english) {
            return actual.msg(key, values, defaultMessage)
        }
        const text = [key].flat().join('.')
        return values && Object.keys(values).length ? `${text} ${JSON.stringify(values)}` : text
    }}
})
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
vi.mock('~/widget/form/assetCombo', () => ({FormAssetCombo: () => null}))
// A tooltip's text is rendered where it is attached, to be read without hovering.
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, disabled, children}) => !disabled && [msg].flat().map(tooltipText).some(line => typeof line === 'string')
        ? <span data-tooltip={JSON.stringify([msg].flat().map(tooltipText).filter(line => typeof line === 'string'))}>{children}</span>
        : children
}))
vi.mock('~/widget/activation/activatable', () => ({
    withActivatable: () => Component => props => <Component {...props} activatable={{active: true, activate: () => {}, deactivate: () => {}}}/>
}))

const {addRecipeType} = await import('~/app/home/body/process/recipeTypeRegistry')
const {requestGate} = await import('./sourceRequirements')
const {pixelOperationsAvailability} = await import('./operationAvailability')
const {sourceProblemsOfState} = await import('./selectedSourceStatus')
const {TranslationProvider} = await import('~/translate')
const modules = {
    MOSAIC: await import('./opticalMosaic/opticalMosaic'),
    TIME_SERIES: await import('./timeSeries/timeSeries'),
    CCDC: await import('./ccdc/ccdc'),
    PHENOLOGY: await import('./phenology/phenology'),
    LANDTRENDR: await import('./landTrendr/landTrendr'),
    CHANGE_ALERTS: await import('./changeAlerts/changeAlerts'),
    PYEO_ALERTS: await import('./pyeoAlerts/pyeoAlerts')
}
Object.values(modules).forEach(module => addRecipeType(module.default()))
const panels = {
    MOSAIC: (await import('./opticalMosaic/panels/sources/sources')).Sources,
    TIME_SERIES: (await import('./timeSeries/panels/sources/sources')).Sources,
    CCDC: (await import('./ccdc/panels/sources/sources')).Sources,
    PHENOLOGY: (await import('./phenology/panels/sources/sources')).Sources,
    LANDTRENDR: (await import('./landTrendr/panels/sources/sources')).Sources,
    CHANGE_ALERTS: (await import('./changeAlerts/panels/sources/sources')).Sources,
    PYEO_ALERTS: (await import('./pyeoAlerts/panels/sources/sources')).Sources
}
const {breakDetectionOptions} = await import('./ccdc/ccdcRecipe')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ID = 'recipe-1'
const CLASSIFICATION = 'classification-1'
const MOSAIC = 'mosaic-1'
const AOI = {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1]]}
const optical = dataSets => ({dataSetType: 'OPTICAL', classification: null, assets: [], cloudPercentageThreshold: 75, dataSets})

// Each type's Sources, over a model whose execution reads the years `from` to `to`; `gated` where its image (and pixel
// observations) are held for this alone, its other prerequisites being met.
const TYPES = [
    {
        type: 'MOSAIC', dataSets: 'process.changeAlerts.panel.sources.form.dataSets.label', required: 'fieldValidation.notEmpty',
        datesPath: 'dates', datesFor: (from, to) => ({targetDate: `${from}-07-01`, seasonStart: `${from}-01-01`, seasonEnd: `${to + 1}-01-01`, yearsBefore: 0, yearsAfter: 0}),
        model: (dataSets, dates) => ({dates, sources: {dataSets, cloudPercentageThreshold: 75}, sceneSelectionOptions: {type: 'ALL'}, compositeOptions: {corrections: ['SR'], compose: 'MEDIAN'}}),
        gated: [IMAGE_OUTPUT]
    },
    {
        type: 'TIME_SERIES', dataSets: 'process.ccdc.panel.sources.form.dataSets.label', required: 'fieldValidation.notEmpty',
        datesPath: 'dates', datesFor: (from, to) => ({startDate: `${from}-01-01`, endDate: `${to + 1}-01-01`}),
        model: (dataSets, dates) => ({dates, sources: optical(dataSets), options: {corrections: ['SR']}}),
        gated: [IMAGE_OUTPUT, PIXEL_OBSERVATIONS]
    },
    {
        type: 'CCDC', dataSets: 'process.ccdc.panel.sources.form.dataSets.label', required: 'fieldValidation.notEmpty',
        datesPath: 'dates', datesFor: (from, to) => ({startDate: `${from}-01-01`, endDate: `${to + 1}-01-01`}),
        model: (dataSets, dates) => ({dates, sources: {...optical(dataSets), breakpointBands: ['ndvi']}, options: {corrections: ['SR']}, ccdcOptions: breakDetectionOptions.moderate}),
        gated: [IMAGE_OUTPUT, PIXEL_OBSERVATIONS]
    },
    {
        type: 'PHENOLOGY', dataSets: 'process.phenology.panel.sources.form.dataSets.label', required: 'fieldValidation.notEmpty',
        datesPath: 'dates', datesFor: (from, to) => ({fromYear: from, toYear: to}),
        model: (dataSets, dates) => ({dates, sources: {...optical(dataSets), band: 'ndvi'}, options: {corrections: ['SR']}}),
        gated: [IMAGE_OUTPUT]
    },
    {
        type: 'LANDTRENDR', dataSets: 'process.landTrendr.panel.sources.form.dataSets.label', required: 'process.landTrendr.panel.sources.form.dataSets.required',
        datesPath: 'dates', datesFor: (from, to) => ({startYear: from, endYear: to}),
        model: (dataSets, dates) => ({dates, sources: {dataSets, cloudPercentageThreshold: 75, index: 'ndvi'}, options: {corrections: ['SR']}, landTrendrOptions: {maxSegments: 6}}),
        gated: [IMAGE_OUTPUT]
    },
    {
        // Beside its data sets it says what its requirements find, not its form's own required rule (inputFeedback.js).
        type: 'CHANGE_ALERTS', dataSets: 'process.changeAlerts.panel.sources.form.dataSets.label', required: null,
        // Monitoring the first half of `to`, calibrated from the start of `from`.
        datesPath: 'date', datesFor: (from, to) => ({
            monitoringEnd: `${to}-07-01`, monitoringDuration: 6, monitoringDurationUnit: 'months', calibrationDuration: to - from, calibrationDurationUnit: 'years'
        }),
        model: (dataSets, date) => ({reference: {}, date, sources: {...optical(dataSets), band: 'ndvi'}, options: {corrections: ['SR']}}),
        // Held for its missing reference in any case: its holds are the shared definition's (dataSetAvailability.test.js).
        gated: []
    },
    {
        type: 'PYEO_ALERTS', dataSets: 'process.pyeoAlerts.panel.sources.form.dataSets.label', required: 'process.pyeoAlerts.panel.sources.form.dataSets.required',
        datesPath: 'dates', datesFor: (from, to) => ({
            baselineStart: `${from - 1}-01-01`, baselineEnd: `${from}-01-01`, monitoringStart: `${from}-01-01`, monitoringEnd: `${to + 1}-01-01`, derived: true
        }),
        model: (dataSets, dates) => ({dates, sources: {classification: CLASSIFICATION, dataSets, cloudPercentageThreshold: 75, changeFromClasses: [1], changeToClasses: [2]}, options: {corrections: ['SR']}}),
        // Held while its Classification's input is described, in any case.
        gated: []
    }
]

const L9 = 'LANDSAT_9'
const L8 = 'LANDSAT_8'
const TM = 'LANDSAT_TM'

let root, container, store, runtime, rendered

beforeEach(() => {
    fake.english = false
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe.each(TYPES)('$type Sources opened over data sets the dates partly exclude', t => {
    it('keep each chosen, giving the years of the one with no imagery in those years, and mark or hold nothing for it', async () => {
        await open(t, [L9, TM], t.datesFor(1985, 1995))

        expect(chosenOf(t)).toEqual([L9, TM])
        expect(markedOf(t)).toEqual([])
        expect(tooltipOf(t, L9)).toEqual([years({fromYear: 2021}), description(L9)])
        expect(tooltipOf(t, TM)).toEqual([description(TM)])
        expect(errorsOf(t)).toEqual([])
        expect(sourcesMark()).toBeUndefined()
        t.gated.forEach(operation => expect(gate(operation)).toBeNull())
    })

    it('offer anew only data sets that may hold imagery in those years', async () => {
        await open(t, [L9, TM], t.datesFor(1985, 1995))

        expect(enabledOf(t)).toEqual([L9, TM, 'LANDSAT_TM_T2'])
    })

    it('change neither draft nor model when rendered again', async () => {
        await open(t, [L9, TM], t.datesFor(1985, 1995))
        const saved = model()

        await rerender()

        expect(chosenOf(t)).toEqual([L9, TM])
        expect(model()).toBe(saved)
        expect(button('button.apply')).toBeUndefined()
    })

    it('keep one the draft chose when Dates then exclude it, offering it no more once removed', async () => {
        await open(t, [TM], t.datesFor(2005, 2016))
        await toggle(t, L8)

        await applyDates(t, t.datesFor(1990, 1995))
        expect(chosenOf(t)).toEqual([L8, TM])
        expect(enabledOf(t)).toContain(L8)
        expect(tooltipOf(t, L8)).toContain(years({fromYear: 2013}))

        await toggle(t, L8)
        expect(chosenOf(t)).toEqual([TM])
        expect(enabledOf(t)).not.toContain(L8)
    })

    it('keep the choice when Dates move out of a data set\'s years and back', async () => {
        await open(t, [L8, TM], t.datesFor(2005, 2016))

        await applyDates(t, t.datesFor(1990, 1995))
        expect(chosenOf(t)).toEqual([L8, TM])
        expect(tooltipOf(t, L8)).toContain(years({fromYear: 2013}))
        expect(errorsOf(t)).toEqual([])

        await applyDates(t, t.datesFor(2005, 2016))
        expect(chosenOf(t)).toEqual([L8, TM])
        expect(tooltipOf(t, L8)).not.toContain(years({fromYear: 2013}))
        expect(appliedDataSets()).toEqual([L8, TM])
    })
})

describe.each(TYPES)('$type Sources whose chosen data sets none may hold imagery in the years read', t => {
    it('say so beside them and on Sources, holding the image, until a data set that may is chosen', async () => {
        await open(t, [L9], t.datesFor(1985, 1995))

        expect(chosenOf(t)).toEqual([L9])
        expect(errorsOf(t)).toEqual([noOverlap(1985, 1995)])
        expect(sourcesMark()).toEqual(noOverlap(1985, 1995))
        t.gated.forEach(operation => expect(gate(operation)).not.toBeNull())

        await toggle(t, TM)
        expect(errorsOf(t)).toEqual([])
        await press('button.apply')

        expect(appliedDataSets()).toEqual([L9, TM])
        expect(sourcesMark()).toBeUndefined()
        t.gated.forEach(operation => expect(gate(operation)).toBeNull())
    })

    it('offer one removed no more once another that may is chosen, and apply only that one', async () => {
        await open(t, [L9], t.datesFor(2014, 2016))
        expect(errorsOf(t)).toEqual([noOverlap(2014, 2016)])

        await toggle(t, L9)
        await toggle(t, L8)
        expect(enabledOf(t)).not.toContain(L9)
        await toggle(t, L9)
        expect(chosenOf(t)).toEqual([L8])
        await press('button.apply')

        expect(appliedDataSets()).toEqual([L8])
    })

    it('offer one removed again once Dates cover its years', async () => {
        await open(t, [L9], t.datesFor(2014, 2016))
        await toggle(t, L9)
        await toggle(t, L8)

        await applyDates(t, t.datesFor(2021, 2023))
        expect(enabledOf(t)).toContain(L9)
        await toggle(t, L9)
        await press('button.apply')

        expect(appliedDataSets()).toEqual([L9, L8])
    })

    it('are repaired by Dates the data sets cover', async () => {
        await open(t, [L9], t.datesFor(1985, 1995))
        await close()

        await applyDates(t, t.datesFor(2020, 2022))
        await reopen()

        expect(errorsOf(t)).toEqual([])
        expect(sourcesMark()).toBeUndefined()
        expect(tooltipOf(t, L9)).not.toContain(years({fromYear: 2021}))
    })

    it('refuse a draft leaving none, by Apply or Enter, until one is chosen again', async () => {
        await open(t, [L9, TM], t.datesFor(1985, 1995))
        const saved = model()

        await toggle(t, TM)
        expect(errorsOf(t)).toEqual([noOverlap(1985, 1995)])
        expect(button('button.apply').disabled).toBe(true)
        await submitByKeyboard()
        expect(model()).toBe(saved)

        await toggle(t, TM)
        expect(errorsOf(t)).toEqual([])
    })

    it('say only that a data set is required while none is chosen', async () => {
        await open(t, [TM], t.datesFor(1985, 1995))

        await toggle(t, TM)

        expect(errorsOf(t)).toEqual(t.required ? [t.required] : [])
    })
})

describe('an Optical Mosaic of selected scenes', () => {
    // The composite reads its scenes by id: the data sets' years constrain only finding them.
    it('holds nothing and refuses no Apply for data sets the dates exclude', async () => {
        const t = TYPES[0]
        await open(t, [L9, TM], t.datesFor(1990, 1990), {sceneSelectionOptions: {type: 'SELECT'}})

        await toggle(t, TM)

        expect(errorsOf(t)).toEqual([])
        expect(button('button.apply').disabled).toBe(false)
        expect(tooltipOf(t, L9)).toContain(years({fromYear: 2021}))
    })
})

describe('a data set the dates exclude, kept chosen', () => {
    it('still narrows the bands CCDC offers to break on', async () => {
        const t = TYPES[2]
        await open(t, [L8, 'SENTINEL_2'], t.datesFor(2013, 2014), {}, {LANDSAT: [L8], SENTINEL_2: ['SENTINEL_2']})

        expect(tooltipOf(t, 'SENTINEL_2')).toContain(years({fromYear: 2015}))
        expect(choicesOf('process.ccdc.panel.sources.form.breakpointBands.label')).not.toContain('thermal')
    })
})

describe('changing the collection type in CCDC Sources', () => {
    it('starts optical data sets with the first that may hold imagery in the years read, and radar with none where none may', async () => {
        const t = TYPES[2]
        await open(t, [TM], t.datesFor(1990, 1995))

        await press('process.ccdc.panel.sources.form.dataSetTypes.RADAR')
        expect(chosenOf(t)).toEqual([])

        await press('process.ccdc.panel.sources.form.dataSetTypes.OPTICAL')
        expect(chosenOf(t)).toEqual([TM])
    })
})

describe('what Sources say of data sets and the years read, in English', () => {
    it('names the years none chosen covers, and the repairs', async () => {
        fake.english = true
        const t = {...TYPES[2], dataSets: 'Data set'}
        await open(t, [L9], t.datesFor(1985, 1995))

        expect(errorsOf(t)).toEqual(['None of the selected data sets covers any year from 1985 to 1995. Select one that does, or change the dates.'])
    })

    it('gives a data set kept chosen the years it holds imagery for', async () => {
        fake.english = true
        const t = {...TYPES[2], dataSets: 'Data set'}
        await open(t, [L8, TM], t.datesFor(2013, 2020))

        expect(tooltipOf(t, TM, 'L4-5')).toEqual(['Imagery from 1982 to 2012.', 'Landsat 4-5'])
    })
})

const noOverlap = (startYear, endYear) => `process.source.dataSets.noPeriodOverlap ${JSON.stringify({startYear, endYear})}`

const years = values => `process.source.dataSets.years.from ${JSON.stringify(values)}`

const label = dataSet => `sources.dataSets.${dataSet}.label`

const description = dataSet => `sources.dataSets.${dataSet}.tooltip`

const groupOf = dataSet => dataSet.startsWith('SENTINEL') ? 'SENTINEL_2' : 'LANDSAT'

const toGroups = dataSets => dataSets.reduce((groups, dataSet) => ({...groups, [groupOf(dataSet)]: [...(groups[groupOf(dataSet)] || []), dataSet]}), {})

const model = () => selectFrom(store.getState(), ['process.loadedRecipes', ID, 'model'])

const appliedDataSets = () => Object.values(model().sources.dataSets).flat()

const applied = () => selectFrom(store.getState(), ['process.loadedRecipes', ID])

const gate = operation => operation === IMAGE_OUTPUT
    ? requestGate({state: store.getState(), recipe: applied(), operation, evidenceOwnerOf: id => runtime.evidenceOwnerOf(id), heldFor: key => runtime.heldFor(key), now: Date.now()})
    : pixelOperationsAvailability({state: store.getState(), recipe: applied(), heldFor: key => runtime.heldFor(key), operations: [operation]}).gate

const sourcesMark = () => sourceProblemsOfState(store.getState(), ID, id => runtime.evidenceOwnerOf(id), Date.now(), key => runtime.heldFor(key)).sources

const field = label => document.querySelector(`[data-label="${label}"]`)

// The data sets a field offers, by identifier: its buttons but the one marking its errors.
const dataSetButtons = t => [...field(t.dataSets).querySelectorAll('button')]
    .filter(button => !button.closest('[data-feedback]') && button.textContent)

const idOf = button => button.textContent.replace(/^sources\.dataSets\.|\.label$/g, '')

const chosenOf = t => dataSetButtons(t).filter(({className}) => /_highlight_/.test(className)).map(idOf)

const enabledOf = t => dataSetButtons(t).filter(({disabled}) => !disabled).map(idOf)

// The data sets marked with a warning icon: none, whatever the dates.
const markedOf = t => dataSetButtons(t).filter(button => button.querySelector('[data-icon="triangle-exclamation"]')).map(idOf)

const tooltipOf = (t, dataSet, text = label(dataSet)) => {
    const button = dataSetButtons(t).find(({textContent}) => textContent === text)
    const tooltip = button.closest('[data-tooltip]')
    return tooltip ? JSON.parse(tooltip.dataset.tooltip) : []
}

const choicesOf = label => [...field(label).querySelectorAll('button')].map(({textContent}) => textContent).filter(Boolean)

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

const submitByKeyboard = async () => {
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true})))
    await act(async () => document.querySelector('form').dispatchEvent(new Event('submit', {bubbles: true, cancelable: true})))
    await settled()
}

// Dates as their panel's Apply commits them.
const applyDates = async (t, dates) => {
    await act(async () => actionBuilder('APPLY_DATES').set(['process.loadedRecipes', ID, 'model', t.datesPath], dates).dispatch())
    await settled()
}

// A store change the panel renders again for, unrelated to its fields.
const rerender = async () => {
    await act(async () => actionBuilder('UNRELATED').set(['process', 'unrelated'], Date.now()).dispatch())
    await settled()
}

const RuntimeProbe = withSourceRuntime()(({sourceRuntime}) => {
    runtime = sourceRuntime
    return null
})

async function open(t, dataSets, dates, overrides = {}, groups = toGroups(dataSets)) {
    const recipe = {id: ID, type: t.type, title: t.type, revision: 1, model: {aoi: AOI, ...t.model(groups, dates), ...overrides}, ui: {initialized: true}}
    fake.stored = {[ID]: recipe, [CLASSIFICATION]: classificationRecord, [MOSAIC]: mosaicRecord}
    const initialState = {
        dimensions: {width: 1024, height: 768},
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: {[ID]: recipe},
            recipes: Object.values(fake.stored).map(({id, type}) => ({id, name: id, type, revision: 1})),
            recipeListing: {checkedAt: Date.now()},
            saveStates: {},
            projects: [],
            tabs: [{id: ID}]
        }
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    rendered = t
    await render()
}

// The panel closed, its draft discarded, and opened again over the session as it stands.
const close = () => act(async () => root.render(null))

const reopen = render

async function render() {
    const Sources = panels[rendered.type]
    const tree = (
        <Provider store={store}>
            <SourceRuntimeProvider>
                <RuntimeProbe/>
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
    )
    await act(async () => root.render(fake.english ? <TranslationProvider>{tree}</TranslationProvider> : tree))
    await settled()
}

// A decision tree over one Mosaic, which needs no training to classify.
const classificationRecord = {
    id: CLASSIFICATION, type: 'CLASSIFICATION', revision: 1,
    model: {
        legend: {entries: [{value: 1, label: 'Forest'}, {value: 2, label: 'Other'}]},
        classifier: {type: 'DECISION_TREE', decisionTree: '1) root 9 0 0 (0 1) *'},
        inputImagery: {images: [{imageId: 'i-1', type: 'RECIPE_REF', id: MOSAIC, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included: ['red', 'nir']}]}]}
    }
}

const mosaicRecord = {
    id: MOSAIC, type: 'MOSAIC', revision: 1,
    model: {
        aoi: AOI,
        dates: {targetDate: '2020-07-01', seasonStart: '2020-01-01', seasonEnd: '2021-01-01', yearsBefore: 0, yearsAfter: 0},
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, cloudPercentageThreshold: 100},
        compositeOptions: {corrections: ['SR'], compose: 'MEDIAN'}
    }
}

async function settled() {
    for (let i = 0; i < 8; i++) {
        await act(async () => {})
    }
}
