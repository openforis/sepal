import {act, useEffect} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {Observable, of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {actionBuilder} from '~/action-builder'
import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {initStore} from '~/store'
import {EventShield} from '~/widget/eventShield'
import {PortalContainer, PortalContext} from '~/widget/portal'

// The Classification a CCDC's or Time Series' Sources select, as the recipe's root and Sources read it for what they and
// OPT, Retrieve and the charts offer of it (selectedClassification.js): one read for the recipe, landing in the session's
// recipe cache, held by the root for the applied selection and by Sources for the one being edited. The source runtime
// reads what its own work needs beside it. The registrations, roots, panels, forms, store and runtime are real; storage's
// reads - the root's and Sources' (`ui`) apart from the runtime's (`runtime`) - Earth Engine, task submission, the roots'
// map and toolbars and the workspace destination's check are the substitutes.

const fake = vi.hoisted(() => ({stored: {}, listing: [], requests: [], holding: false, notified: [], bandReads: 0}))
vi.mock('~/apiRegistry', () => ({default: {
    gee: {
        loadTimeSeriesObservations$: () => of({features: []}),
        loadCCDCSegments$: () => of([]),
        assetVersions$: ({ids}) => of({assets: ids.map(id => ({id, type: 'IMAGE', version: 'v1'}))}),
        bands$: ({recipe}) => {
            fake.bandReads++
            return recipe?.type === 'CCDC' ? of(CCDC_BANDS) : of(['red', 'nir'].map(name => ({name, arrayDimensions: 0})))
        }
    },
    recipe: {
        load$: id => read$('ui', id),
        loadAll$: () => of(fake.listing),
        save$: () => of()
    },
    tasks: {submit$: task => of(task)}
}}))
vi.mock('../sourceRuntime/recipeClosureLoader', async () => {
    const {createLoadRecipesById$} = await import('#sepal/recipe/source/recipeClosureLoader')
    return {createLoadRecipesById$: () => createLoadRecipesById$({loadRecipe$: id => read$('runtime', id)})}
})
vi.mock('~/translate', () => ({msg: (key, args) => [[key].flat().join('.'), ...Object.values(args || {})].join(' ')}))
vi.mock('~/user', () => ({isGoogleAccount: () => true}))
vi.mock('~/eventPublisher', () => ({publishEvent: () => {}}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: notification => fake.notified.push(notification)}}))
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, children}) => msg ? <><span data-message>{[msg].flat().join(' ')}</span>{children}</> : children
}))
vi.mock('~/widget/form/assetCombo', () => ({FormAssetCombo: () => null}))
vi.mock('~/widget/activation/activatable', () => ({
    withActivatable: () => Component => props => (
        <Component {...props} activatable={{active: true, activate: () => {}, deactivate: () => {}}}/>
    )
}))
vi.mock('~/widget/assetDestination', () => ({
    AssetDestination: ({onValidityCheckChange}) => {
        useEffect(() => onValidityCheckChange(false), [])
        return null
    }
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
// The roots' map and toolbars, so the panels they would open are the ones mounted beside them.
vi.mock('~/app/home/map/map', async importOriginal => ({...await importOriginal(), Map: ({children}) => children}))
vi.mock('./ccdc/panels/ccdcToolbar', () => ({CcdcToolbar: () => null}))
vi.mock('./timeSeries/panels/timeSeriesToolbar', () => ({TimeSeriesToolbar: () => null}))
vi.mock('./aoi', async importOriginal => ({...await importOriginal(), Aoi: () => null}))
vi.mock('./recipeImageLayerSource', async importOriginal => ({...await importOriginal(), initializeLayers: () => {}}))

const {addRecipeType} = await import('../recipeTypeRegistry')
const {default: ccdc} = await import('./ccdc/ccdc')
const {default: timeSeries} = await import('./timeSeries/timeSeries')
const {Sources: CcdcSources} = await import('./ccdc/panels/sources/sources')
const {Options: CcdcOptions} = await import('./ccdc/panels/options/options')
const {Retrieve: CcdcRetrieve} = await import('./ccdc/panels/retrieve/retrieve')
const {Retrieve: TimeSeriesRetrieve} = await import('./timeSeries/panels/retrieve/retrieve')

addRecipeType(ccdc())
addRecipeType(timeSeries())

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, store, mounted

beforeEach(() => {
    fake.stored = {
        [FORESTS]: classificationOf(FORESTS, FOREST_LEGEND),
        [WATERS]: classificationOf(WATERS, WATER_LEGEND),
        [WATER_ONLY]: classificationOf(WATER_ONLY, {entries: [{value: 1, label: 'Water'}]}, {type: 'SVM', svmType: 'ONE_CLASS', oneClass: 1})
    }
    fake.listing = LISTING
    fake.requests = []
    fake.holding = false
    fake.notified = []
    fake.bandReads = 0
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    document.body.innerHTML = ''
})

describe('the Classification a CCDC\'s Sources select, as its root and Sources hold it', () => {
    it('is read once for both, opening together on a cold cache, and offered once read', async () => {
        fake.holding = true
        await open({panels: <CcdcSources/>})

        expect(requests('ui', FORESTS)).toHaveLength(1)
        await answer(FORESTS)

        expect(breakpointChoices()).toContain(probability('Forest'))
    })

    it('leaves runtime work started before that read lands to read it too, and work started after to take the session\'s', async () => {
        fake.holding = true
        await open({panels: <CcdcSources/>})
        expect(requests('runtime', FORESTS).length).toBeGreaterThan(0)
        await answer(FORESTS)
        const runtimeReads = requests('runtime', FORESTS).length
        const bandReads = fake.bandReads

        await press('sources.dataSets.LANDSAT_7.label')

        expect(fake.bandReads).toBeGreaterThan(bandReads)
        expect(requests('runtime', FORESTS)).toHaveLength(runtimeReads)
    })

    it('goes on being read for the root when Sources close before it lands', async () => {
        fake.holding = true
        await open({panels: <CcdcSources/>})

        await show(null)

        expect(requests('ui', FORESTS).map(({cancelled}) => cancelled)).toEqual([false])
        await answer(FORESTS)
        expect(sessionHolds(FORESTS)).toBe(true)
    })

    it('goes on being read for Sources when the root goes before it lands', async () => {
        fake.holding = true
        await open({panels: <CcdcSources/>})

        await show(<CcdcSources/>, {withRoot: false})

        expect(requests('ui', FORESTS).map(({cancelled}) => cancelled)).toEqual([false])
        await answer(FORESTS)
        expect(breakpointChoices()).toContain(probability('Forest'))
    })

    it('reads another selected in Sources for them alone, cancelling that read once they close, the applied one kept', async () => {
        await open({panels: <CcdcSources/>})
        fake.holding = true
        await selectClassification(WATERS)
        expect(requests('ui', WATERS)).toHaveLength(1)

        await show(null)

        expect(requests('ui', WATERS).map(({cancelled}) => cancelled)).toEqual([true])
        expect(sessionHolds(WATERS)).toBe(false)
        expect(sessionHolds(FORESTS)).toBe(true)
    })

    it('offers the one Sources end on through A → B → A, the answer about B writing nothing', async () => {
        await open({panels: <CcdcSources/>})
        fake.holding = true

        await selectClassification(WATERS)
        await selectClassification(FORESTS)
        await answer(WATERS)

        expect(sessionHolds(WATERS)).toBe(false)
        expect(breakpointChoices()).toContain(probability('Forest'))
        expect(breakpointChoices()).not.toContain(probability('Water'))
        expect(requests('ui', FORESTS)).toHaveLength(1)
    })

    it('offers no classified output once Sources clear the selection, the root still holding the one applied', async () => {
        await open({panels: <CcdcSources/>})

        await clearClassification()

        expect(breakpointChoices().filter(choice => choice.startsWith(PROBABILITY))).toEqual([])
        expect(sessionHolds(FORESTS)).toBe(true)
    })

    it('cancels what it is reading as its tab closes', async () => {
        fake.holding = true
        await open({panels: <CcdcSources/>})

        await show(null, {withRoot: false})

        expect(requests('ui', FORESTS).map(({cancelled}) => cancelled)).toEqual([true])
    })

    it('leaves the session holding nothing of what it read once its tab closes', async () => {
        await open({panels: <CcdcSources/>})
        expect(sessionHolds(FORESTS)).toBe(true)

        await show(null, {withRoot: false})

        expect(sessionHolds(FORESTS)).toBe(false)
    })
})

describe('a selected Classification not read yet, or not readable', () => {
    it('keeps a classified breakpoint band chosen and shown while it is read, its selector saying so', async () => {
        fake.holding = true
        await open({breakpointBands: ['probability_1'], panels: <CcdcSources/>})

        expect(chosenBreakpointBands()).toEqual([CLASS_1_PROBABILITY])
        expect(busy(CCDC_CLASSIFICATION)).toBe(true)

        await answer(FORESTS)

        expect(chosenBreakpointBands()).toEqual([probability('Forest')])
        expect(busy(CCDC_CLASSIFICATION)).toBe(false)
    })

    it('keeps it chosen and shown where the read fails, said once, and offers it once Sources select the Classification again', async () => {
        fake.holding = true
        await open({breakpointBands: ['probability_1'], panels: <CcdcSources/>})
        await fail(FORESTS)
        expect(fake.notified).toHaveLength(1)
        expect(chosenBreakpointBands()).toEqual([CLASS_1_PROBABILITY])
        fake.holding = false

        await clearClassification()
        await selectClassification(FORESTS)

        expect(chosenBreakpointBands()).toEqual([probability('Forest')])
        expect(fake.notified).toHaveLength(1)
    })

    it('offers it as soon as the session holds it, as when another tab opens it, without Sources reopening', async () => {
        fake.holding = true
        await open({breakpointBands: ['probability_1'], panels: <CcdcSources/>})
        await fail(FORESTS)

        await holdInSession(classificationOf(FORESTS, FOREST_LEGEND))

        expect(chosenBreakpointBands()).toEqual([probability('Forest')])
    })

    it('keeps Time Series Retrieve waiting on the regression selected while it is read, offering it once it is', async () => {
        fake.holding = true
        await open({type: 'TIME_SERIES', panels: <TimeSeriesRetrieve/>})

        expect(retrieveChoices()).toContain(REGRESSION)
        expect(shown()).toContain(RETRIEVE_LOADING)
        expect(applyEnabled()).toBe(false)

        await answer(FORESTS)

        expect(retrieveChoices()).toContain(REGRESSION)
        expect(shown()).not.toContain(RETRIEVE_LOADING)
    })
})

describe('what is offered of the Classification a CCDC\'s Sources select', () => {
    it('follows one Sources apply into OPT\'s TMask choices', async () => {
        await open({
            breakpointBands: ['probability_1', 'probability_2'],
            ccdcOptions: {...MODERATE, tmaskBands: ['probability_1', 'probability_2']},
            panels: <><CcdcSources/><CcdcOptions/></>
        })
        expect(tmaskChoices()).toEqual([probability('Forest'), probability('Other')])

        await selectClassification(WATERS)
        await press('button.apply')

        expect(tmaskChoices()).toEqual([probability('Water'), probability('Land')])
    })

    it('names OPT\'s TMask choices as the Classification is renamed in another tab', async () => {
        await open({
            breakpointBands: ['probability_1', 'probability_2'],
            ccdcOptions: {...MODERATE, tmaskBands: ['probability_1', 'probability_2']},
            panels: <CcdcOptions/>
        })

        await holdInSession(classificationOf(FORESTS, {entries: [{value: 1, label: 'Woodland'}, {value: 2, label: 'Other'}]}))

        expect(tmaskChoices()).toEqual([probability('Woodland'), probability('Other')])
    })

    it('names a retained TMask output alike in OPT\'s choice and its error as its class is renamed in another tab', async () => {
        await open({
            breakpointBands: ['probability_1'],
            ccdcOptions: {...MODERATE, tmaskBands: ['probability_1', 'probability_2']},
            panels: <CcdcOptions/>
        })
        expect(tmaskChoices()).toEqual([probability('Forest'), probability('Other')])
        expect(shown()).toContain(notBreakpointBand('Other'))

        await holdInSession(classificationOf(FORESTS, {entries: [{value: 1, label: 'Forest'}, {value: 2, label: 'Rest'}]}))

        expect(tmaskChoices()).toEqual([probability('Forest'), probability('Rest')])
        expect(shown()).toContain(notBreakpointBand('Rest'))
        expect(shown()).not.toContain(notBreakpointBand('Other'))
    })

    it('names a TMask output Sources no longer fit as Sources named it, keeping it chosen and saying it is missing', async () => {
        await open({
            breakpointBands: ['probability_1', 'probability_2'],
            ccdcOptions: {...MODERATE, tmaskBands: ['probability_1', 'probability_2']},
            panels: <CcdcSources/>
        })
        await act(async () => button(probability('Other'), document.querySelector(`[data-label="${BREAKPOINT_BANDS}"]`)).click())
        await press('button.apply')

        await show(<CcdcOptions/>)

        expect(tmaskChoices()).toEqual([probability('Forest'), probability('Other')])
        expect(shown()).toContain(`process.ccdc.panel.options.form.tmaskBands.notBreakpointBands ${probability('Other')} 1`)
    })

    it('labels the measures CCDC Retrieve offers by it, following an edit to it in another tab', async () => {
        await open({panels: <CcdcRetrieve/>})
        await outlastRetrieveLoading()
        expect(retrieveChoices()).toContain(probability('Forest'))

        await holdInSession(classificationOf(FORESTS, {entries: [{value: 1, label: 'Woodland'}, {value: 2, label: 'Other'}]}))

        expect(retrieveChoices()).toContain(probability('Woodland'))
    })

    it('names an output the one Sources select names but does not provide as that one does, whatever else is edited since', async () => {
        await open({breakpointBands: ['probability_1'], panels: <CcdcSources/>})
        await selectClassification(WATER_ONLY)

        await holdInSession(classificationOf(FORESTS, {entries: [{value: 1, label: 'Woods'}, {value: 2, label: 'Other'}]}))
        await press('button.less')
        await press('button.more')

        expect(chosenBreakpointBands()).toEqual([probability('Water')])
        expect(breakpointMessages()).toEqual([`process.source.classifiedOutputs.breakpointBands ${probability('Water')}`])
    })

    it('names a retained output alike in its choice and refusal as the Classification still applied is renamed', async () => {
        fake.stored[WATERS] = classificationOf(WATERS, {entries: [{value: 3, label: 'Water'}, {value: 4, label: 'Land'}]})
        await open({breakpointBands: ['probability_1'], panels: <CcdcSources/>})
        await selectClassification(WATERS)
        expect(chosenBreakpointBands()).toEqual([probability('Forest')])
        expect(breakpointMessages()).toEqual([`process.source.classifiedOutputs.breakpointBands ${probability('Forest')}`])

        await holdInSession(classificationOf(FORESTS, {entries: [{value: 1, label: 'Woods'}, {value: 2, label: 'Other'}]}))
        await press('button.less')
        await press('button.more')

        expect(chosenBreakpointBands()).toEqual([probability('Woods')])
        expect(breakpointMessages()).toEqual([`process.source.classifiedOutputs.breakpointBands ${probability('Woods')}`])
    })

    it('keeps the name a class was shown by once the Classification selected removes that class', async () => {
        await open({breakpointBands: ['probability_1'], panels: <CcdcSources/>})
        expect(chosenBreakpointBands()).toEqual([probability('Forest')])

        await holdInSession(classificationOf(FORESTS, {entries: [{value: 3, label: 'Water'}, {value: 4, label: 'Land'}]}))
        await press('button.less')
        await press('button.more')

        expect(chosenBreakpointBands()).toEqual([probability('Forest')])
        expect(breakpointMessages()).toEqual([`process.source.classifiedOutputs.breakpointBands ${probability('Forest')}`])
    })

    it('follows an edit to it in another tab, without Sources reopening', async () => {
        await open({panels: <CcdcSources/>})

        await holdInSession(classificationOf(FORESTS, {entries: [...FOREST_LEGEND.entries, {value: 3, label: 'Urban'}]}))

        expect(breakpointChoices()).toContain(probability('Urban'))
    })

    it('leaves the recipe and Sources\' draft as they were on opening and as the read lands', async () => {
        fake.holding = true
        await open({breakpointBands: ['ndvi', 'probability_1'], panels: <CcdcSources/>})
        const opened = recipe()

        await answer(FORESTS)

        expect(recipe().model).toBe(opened.model)
        expect(recipe().ui.sources).toEqual(opened.ui.sources)
        expect(recipe().ui.classification).toBeUndefined()
        expect(button('button.apply', sourcesPanel())).toBeUndefined()
    })
})

const ID = 'recipe-1'
const FORESTS = 'forests'
const WATERS = 'waters'
const WATER_ONLY = 'water-only'
const FOREST_LEGEND = {entries: [{value: 1, label: 'Forest'}, {value: 2, label: 'Other'}]}
const WATER_LEGEND = {entries: [{value: 1, label: 'Water'}, {value: 2, label: 'Land'}]}
const PROBABILITY = 'process.classification.bands.probability'
const CLASS_1_PROBABILITY = 'process.classification.bands.classValueProbability 1'
const REGRESSION = 'process.classification.bands.regression'
const RETRIEVE_LOADING = 'process.retrieve.form.bands.loading'
const CCDC_CLASSIFICATION = 'process.ccdc.panel.sources.form.classification.label'
const MODERATE = {dateFormat: 1, minObservations: 6, chiSquareProbability: 0.9, minNumOfYearsScaler: 1.33, lambda: 20, maxIterations: 25000}

const probability = label => `${PROBABILITY} ${label}`

// What the CCDC fits, as Earth Engine describes its segments.
const CCDC_BANDS = [
    'tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb',
    ...['ndvi', 'probability_1'].flatMap(measure => ['coefs', 'rmse', 'magnitude'].map(suffix => `${measure}_${suffix}`))
]

const LISTING = [
    {id: ID, name: ID, type: 'CCDC', revision: 1},
    {id: FORESTS, name: FORESTS, type: 'CLASSIFICATION', revision: 1},
    {id: WATERS, name: WATERS, type: 'CLASSIFICATION', revision: 1},
    {id: WATER_ONLY, name: WATER_ONLY, type: 'CLASSIFICATION', revision: 1}
]

// A Random Forest over an asset, trained on points of its own - or a one-class SVM, which provides no class probability.
const classificationOf = (id, legend, classifier = {type: 'RANDOM_FOREST'}) => ({
    id,
    type: 'CLASSIFICATION',
    revision: 1,
    model: {
        inputImagery: {images: [{imageId: 'i-1', type: 'ASSET', id: 'users/x/input', bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included: ['red', 'nir']}]}]},
        legend,
        classifier,
        trainingData: {dataSets: [{dataSetId: 'collected', type: 'COLLECTED', name: 'Collected', referenceData: [{x: 1, y: 1, class: 1}, {x: 2, y: 2, class: 2}]}]}
    }
})

// Over Landsat 8 scenes, its Sources selecting the forests; a Time Series' Retrieve last asked for the regression.
const recipeOf = ({type, breakpointBands, ccdcOptions}) => ({
    id: ID,
    type,
    title: 'Recipe',
    revision: 1,
    model: {
        aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1]]},
        dates: {startDate: '2015-01-01', endDate: '2021-01-01'},
        sources: {
            dataSetType: 'OPTICAL', dataSets: {LANDSAT: ['LANDSAT_8']}, assets: [], cloudPercentageThreshold: 75, classification: FORESTS,
            ...(type === 'CCDC' ? {breakpointBands} : {})
        },
        options: {corrections: ['SR']},
        ...(type === 'CCDC' ? {ccdcOptions} : {})
    },
    ui: {
        initialized: true,
        ...(type === 'TIME_SERIES' && {
            retrieve: {bands: ['regression'], scale: 30, tileSize: 2, shardSize: 256, fileDimensionsMultiple: 2, destination: 'SEPAL', filenamePrefix: 'series'}
        })
    }
})

// A read of storage, answered at once unless reads are being held. Each is recorded as it is made, with whether it was
// let go before it was answered.
function read$(kind, id) {
    return new Observable(subscriber => {
        const request = {kind, id, cancelled: false, settled: false}
        request.answer = () => {
            request.settled = true
            subscriber.next(fake.stored[id])
            subscriber.complete()
        }
        request.fail = () => {
            request.settled = true
            subscriber.error(Object.assign(new Error(`${id} could not be read`), {status: 500}))
        }
        fake.requests.push(request)
        if (!fake.holding) {
            request.answer()
        }
        return () => {
            request.cancelled = !request.settled
        }
    })
}

const requests = (kind, id) => fake.requests.filter(request => request.kind === kind && request.id === id)

// Storage answers what was asked of it about `id` and has not been let go, and answers further reads at once.
const answer = async id => {
    fake.holding = false
    await act(async () => fake.requests
        .filter(request => request.id === id && !request.settled && !request.cancelled)
        .forEach(request => request.answer()))
    await settled()
}

// Storage fails what the root and Sources asked of it about `id`.
const fail = async id => {
    await act(async () => requests('ui', id)
        .filter(request => !request.settled && !request.cancelled)
        .forEach(request => request.fail()))
    await settled()
}

const holdInSession = async record => {
    await act(async () => actionBuilder('HOLD').set(['process.loadedRecipes', record.id], record).dispatch())
    await settled()
}

const recipe = () => store.getState().process.loadedRecipes[ID]

const sessionHolds = id => Boolean(store.getState().process.loadedRecipes[id])

const button = (label, within = document) => [...within.querySelectorAll('button')].find(button => button.textContent === label)

const sourcesPanel = () => [...document.querySelectorAll('form')].find(form => form.textContent.includes('panel.sources.title'))

// The choices a field offers, by name: its buttons but the one marking its errors, which names nothing.
const choicesAt = label => [...document.querySelectorAll(`[data-label="${label}"] button`)].map(({textContent}) => textContent).filter(Boolean)

const BREAKPOINT_BANDS = 'process.ccdc.panel.sources.form.breakpointBands.label'

const breakpointChoices = () => choicesAt(BREAKPOINT_BANDS)

const chosenBreakpointBands = () => [...document.querySelectorAll('[data-label="process.ccdc.panel.sources.form.breakpointBands.label"] button')]
    .filter(button => /_highlight_/.test(button.className))
    .map(({textContent}) => textContent)

const tmaskChoices = () => choicesAt('process.ccdc.panel.options.form.tmaskBands.label')

// What OPT says of a TMask band, named as a class of the Classification, that is not a breakpoint band.
const notBreakpointBand = label => `process.ccdc.panel.options.form.tmaskBands.notBreakpointBands ${probability(label)} 1`

const breakpointMessages = () => [...document.querySelectorAll('[data-label="process.ccdc.panel.sources.form.breakpointBands.label"] [data-message]')]
    .map(({textContent}) => textContent)
    .filter(message => message.includes('classifiedOutputs'))

const retrieveChoices = () => choicesAt('process.retrieve.form.bands.label')

const applyEnabled = () => !button('process.retrieve.apply').disabled

const shown = () => document.body.textContent

// Past the loading view Retrieve shows for a minimum while reading its output (retrievePanel.jsx).
const outlastRetrieveLoading = async () => {
    await act(() => new Promise(resolve => setTimeout(resolve, 600)))
    await settled()
}

// Whether the field says it is busy, as its widget is styled while it is.
const busy = label => [...document.querySelectorAll(`[data-label="${label}"] *`)].some(element => /_busy_/.test(element.className))

const press = async label => {
    const pressed = button(label, sourcesPanel())
    expect(pressed, `no button ${label} in Sources`).toBeDefined()
    await act(async () => pressed.click())
    await settled()
}

const clearClassification = async () => {
    const clear = document.querySelector(`[data-label="${CCDC_CLASSIFICATION}"] [data-icon="xmark"]`)?.closest('button')
    expect(clear, 'the classification selector offers no way to clear').toBeTruthy()
    await act(async () => clear.click())
    await settled()
}

const selectClassification = async name => {
    const input = document.querySelector(`[data-label="${CCDC_CLASSIFICATION}"] input`)
    await act(async () => input.click())
    const option = [...document.querySelectorAll('li')].map(item => item.firstElementChild).find(item => item?.textContent === name)
    expect(option, `no option for ${name}`).toBeDefined()
    await act(async () => option.click())
    await settled()
}

const settled = async () => {
    for (let i = 0; i < 8; i++) {
        await act(async () => {})
    }
}

const ROOTS = {CCDC: ccdc().components.recipe, TIME_SERIES: timeSeries().components.recipe}

const open = async ({type = 'CCDC', breakpointBands = ['ndvi'], ccdcOptions = MODERATE, panels}) => {
    mounted = {Root: ROOTS[type]}
    const initialState = {
        dimensions: {width: 1024, height: 768},
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: {[ID]: recipeOf({type, breakpointBands, ccdcOptions})},
            tabs: [{id: ID}],
            saveStates: {},
            recipes: fake.listing.map(entry => entry.id === ID ? {...entry, type} : entry),
            recipeListing: {checkedAt: Date.now()},
            projects: []
        }
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await show(panels)
}

// The recipe's tab showing `panels`, beside its root unless that is gone.
const show = async (panels, {withRoot = true} = {}) => {
    const {Root} = mounted
    await act(async () => root.render(
        <Provider store={store}>
            <SourceRuntimeProvider>
                <PortalContainer/>
                <PortalContainer id='test-portal'/>
                <PortalContext id='test-portal'>
                    <EventShield>
                        <Recipe id={ID}>
                            {withRoot ? <Root/> : null}
                            {panels}
                        </Recipe>
                    </EventShield>
                </PortalContext>
            </SourceRuntimeProvider>
        </Provider>
    ))
    await settled()
}
