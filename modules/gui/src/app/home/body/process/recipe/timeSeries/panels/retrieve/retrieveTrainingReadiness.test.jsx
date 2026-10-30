import {act, useEffect} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {defer, finalize, of, Subject, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {actionBuilder} from '~/action-builder'
import {Recipe, withRecipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider, useSourceRuntime} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {compose} from '~/compose'
import {initStore, select} from '~/store'
import {ActivationContext} from '~/widget/activation/activationContext'
import {EventShield} from '~/widget/eventShield'
import {PanelWizard} from '~/widget/panelWizard'
import {PortalContainer, PortalContext} from '~/widget/portal'
import {tooltipText} from '~/widget/tooltip.test.fixtures'

// What Time Series Retrieve is held to, as the server holds the download (task/export/timeSeries.js): what the recipe's
// image output requires - the Classification its Sources select trainable among it - whatever indicators are selected,
// of the scenes or computed by that Classification. Once that is found not to hold, an open Retrieve closes, as a chart
// does, and its action is disabled while SRC, where it is repaired, says why; repair offers it again, opening on what
// was last submitted. What is still being read, or cannot be, and a save not yet acknowledged, hold the submission with
// the panel open, as a selection or destination the form leaves incomplete does. Nothing is submitted while held, by
// Apply or by the form itself, judged from the session as it stands when submitted. The registrations, runtime,
// activation, Retrieve action, section marks, form, panel and submission are real; storage, Earth Engine, task
// submission and the workspace destination's check are the substitutes.

const {inputBands$, saveRecipe$} = vi.hoisted(() => ({inputBands$: vi.fn(), saveRecipe$: vi.fn()}))
const fake = vi.hoisted(() => ({stored: {}, submitted: [], projects: [], workspacePath: null}))
vi.mock('~/apiRegistry', () => ({default: {
    gee: {
        assetVersions$: ({ids}) => of({assets: ids.map(id => ({id, type: 'IMAGE', version: 'v1'}))}),
        bands$: ({asset}) => inputBands$(asset)
    },
    recipe: {
        load$: id => of(fake.stored[id]),
        loadAll$: () => of(LISTING),
        save$: request => saveRecipe$(request)
    },
    project: {
        save$: project => {
            fake.projects.push(project)
            return of([project])
        }
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
// A toolbar button is pressed by its icon; it says whether what it opens is open.
vi.mock('~/widget/toolbar/toolbarButton', () => ({
    ToolbarButton: ({icon, disabled, selected, onClick}) =>
        <button data-icon={icon} aria-pressed={Boolean(selected)} disabled={disabled} onClick={onClick}/>
}))
// The workspace destination checks the user's files: it names a folder, reports that its check has settled, and is
// handed its input to name another.
vi.mock('~/widget/workspaceDestination', () => ({
    WorkspaceDestination: ({workspacePathInput, onValidityCheckChange}) => {
        fake.workspacePath = workspacePathInput
        useEffect(() => {
            workspacePathInput.value || workspacePathInput.set('downloads/series')
            onValidityCheckChange(false)
        }, [])
        return null
    }
}))

const {addRecipeType} = await import('../../../../recipeTypeRegistry')
const {default: timeSeries} = await import('../../timeSeries')
const {default: classification} = await import('../../../classification/classification')
const {default: opticalMosaic} = await import('../../../opticalMosaic/opticalMosaic')
const {RetrieveButton} = await import('../../../retrieveButton')
const {withSourceProblems} = await import('../../../selectedSource')
const {Retrieve} = await import('./retrieve')
const {forgetRecipeSaveState} = await import('~/app/home/body/process/recipe')

addRecipeType(timeSeries())
addRecipeType(classification())
addRecipeType(opticalMosaic())

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, store

beforeEach(() => {
    inputBands$.mockReset().mockReturnValue(of(INPUT_BANDS))
    saveRecipe$.mockReset().mockReturnValue(of({revision: 2}))
    fake.submitted = []
    fake.projects = []
    fake.workspacePath = null
    watched.length = 0
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    document.body.innerHTML = ''
    // The session's saves outlive a test: what one acknowledged is not the next one's storage.
    ;[ID, CLASSIFICATION, MOSAIC].forEach(forgetRecipeSaveState)
})

// Read as the suites are defined.
const CLASSIFIED_INDICATOR = 'regression'
const NATIVE_INDICATOR = 'ndvi'

describe('an open Time Series Retrieve whose Classification loses its points', () => {
    it.each([['one it computes', CLASSIFIED_INDICATOR], ['one of the scenes', NATIVE_INDICATOR]])('closes over %s, submitting nothing, its action disabled while SRC says why', async (_case, selected) => {
        await open({selected: [selected]})
        await openRetrieve()
        expect(panelOpen()).toBe(true)

        await holdTrainingData([])

        expect(panelOpen()).toBe(false)
        expect(retrieveButton().disabled).toBe(true)
        expect(marked()).toEqual(['sources'])
        await act(async () => retrieveButton().click())
        await settled()
        expect(panelOpen()).toBe(false)
        expect(fake.submitted).toEqual([])
    })

    it('is offered again once they are restored, without opening, and opens on what was last submitted, not on what was edited since', async () => {
        await open({selected: [NATIVE, CLASSIFIED]})
        await openRetrieve()
        await click(REGRESSION)
        await holdTrainingData([])

        await holdTrainingData([COLLECTED])
        expect(retrieveButton().disabled).toBe(false)
        expect(panelOpen()).toBe(false)
        await openRetrieve()
        await apply()

        expect(indicators()).toEqual([[NATIVE, CLASSIFIED]])
        expect(fake.submitted[0].params.image).toMatchObject({destination: 'SEPAL', workspacePath: 'downloads/series', scale: 30})
    })

    it.each([['one it computes', CLASSIFIED_INDICATOR], ['one of the scenes', NATIVE_INDICATOR]])('submits nothing of %s, leaving the destination remembered, where they are removed in the event submitting it', async (_case, selected) => {
        await open({selected: [selected]})
        await openRetrieve()
        expect(applyEnabled()).toBe(true)

        await act(async () => {
            actionBuilder('EDIT_TRAINING_DATA')
                .set(['process.loadedRecipes', CLASSIFICATION, 'model.trainingData.dataSets'], [])
                .dispatch()
            requestSubmit()
        })
        await settled()

        expect(fake.submitted).toEqual([])
        expect(fake.projects).toEqual([])
        expect(panelOpen()).toBe(false)
    })
})

describe('an open Time Series Retrieve whose image output can no longer run', () => {
    it('closes over an indicator of the scenes, and submits it once repaired and opened again', async () => {
        await open({selected: [NATIVE]})
        await openRetrieve()

        await holdIncluded(RADAR_FEATURES)
        expect(panelOpen()).toBe(false)
        expect(retrieveButton().disabled).toBe(true)

        await holdIncluded(['red', 'nir'])
        await openRetrieve()
        await apply()
        expect(indicators()).toEqual([[NATIVE]])
    })
})

describe('an open Time Series Retrieve whose Classification imagery is not yet known', () => {
    it.each([['one it computes', CLASSIFIED_INDICATOR], ['one of the scenes', NATIVE_INDICATOR]])('holds %s open, saying nothing is wrong, until that imagery is observed, then submits it', async (_case, selected) => {
        await open({selected: [selected]})
        await openRetrieve()
        const observed = new Subject()
        inputBands$.mockReturnValue(observed)

        await holdInput(ASSET_INPUT)
        expect(panelOpen()).toBe(true)
        expect(applyEnabled()).toBe(false)
        expect(shown()).toContain('process.retrieve.form.bands.checking')
        await apply()
        expect(fake.submitted).toEqual([])
        expect(panelOpen()).toBe(true)

        await act(async () => observed.next(INPUT_BANDS))
        await settled()
        await apply()
        expect(indicators()).toEqual([[selected]])
    })

    it('holds it open, finding nothing, where that imagery cannot be observed', async () => {
        await open({selected: [NATIVE]})
        await openRetrieve()
        inputBands$.mockReturnValue(throwError(() => new Error('Earth Engine unreachable')))

        await holdInput(ASSET_INPUT)
        expect(panelOpen()).toBe(true)
        await apply()

        expect(fake.submitted).toEqual([])
        expect(panelOpen()).toBe(true)
        expect(shown()).toContain('process.retrieve.source.unavailable')
        expect(shown()).toContain('process.retrieve.assets.retry')
    })
})

// Enter in a field submits the form, whatever Apply says (widget/form/panel.jsx).
describe('an open Time Series Retrieve submitted from the keyboard while its Classification imagery is being observed', () => {
    it('stays open, keeping the folder edited unsaved and submitting nothing, then submits it once that imagery is observed', async () => {
        await open({selected: [NATIVE]})
        await openRetrieve()
        const observed = new Subject()
        inputBands$.mockReturnValue(observed)
        await holdInput(ASSET_INPUT)
        await act(async () => fake.workspacePath.set('downloads/unsubmitted'))
        await settled()

        await act(async () => requestSubmit())
        await settled()

        expect(panelOpen()).toBe(true)
        expect(savedSettings()).toMatchObject({workspacePath: 'downloads/series'})
        expect(fake.submitted).toEqual([])
        expect(fake.projects).toEqual([])

        await act(async () => observed.next(INPUT_BANDS))
        await settled()
        await act(async () => requestSubmit())
        await settled()
        expect(fake.submitted.map(({params}) => params.image.workspacePath)).toEqual(['downloads/unsubmitted'])
        expect(savedSettings()).toMatchObject({workspacePath: 'downloads/unsubmitted'})
    })
})

describe('an open Time Series Retrieve over a Classification edited in its own tab', () => {
    it('holds it open until the points it is given are saved, submitting once storage holds them', async () => {
        await open({selected: [CLASSIFIED], classificationOpen: true})
        await openRetrieve()
        const save = new Subject()
        saveRecipe$.mockReturnValueOnce(save)
        const saves = saveRecipe$.mock.calls.length

        await holdTrainingData([COLLECTED, ADDED])
        await vi.waitFor(() => expect(saveRecipe$.mock.calls.length).toBe(saves + 1))
        await settled()
        expect(panelOpen()).toBe(true)
        expect(applyEnabled()).toBe(false)
        await apply()
        expect(fake.submitted).toEqual([])
        expect(panelOpen()).toBe(true)

        await act(async () => {
            save.next({revision: 2})
            save.complete()
        })
        await settled()
        await apply()
        expect(indicators()).toEqual([[CLASSIFIED]])
    })
})

describe('an open Time Series Retrieve its own form leaves incomplete', () => {
    it('stays open with nothing selected, submitting once an indicator is', async () => {
        await open({selected: [CLASSIFIED]})
        await openRetrieve()

        await click(REGRESSION)
        expect(panelOpen()).toBe(true)
        expect(applyEnabled()).toBe(false)

        await click(REGRESSION)
        await apply()
        expect(indicators()).toEqual([[CLASSIFIED]])
    })

    it('stays open with no workspace folder named, submitting to the one named then', async () => {
        await open({selected: [NATIVE]})
        await openRetrieve()

        await act(async () => fake.workspacePath.set(''))
        await settled()
        expect(panelOpen()).toBe(true)
        expect(applyEnabled()).toBe(false)

        await act(async () => fake.workspacePath.set('downloads/other'))
        await settled()
        await apply()
        expect(fake.submitted.map(({params}) => params.image.workspacePath)).toEqual(['downloads/other'])
    })
})

// What is offered is judged at submission as the session then holds it, not as the panel last rendered it. A refused
// submission leaves the panel open.
describe('Time Series Retrieve of an indicator no longer offered when the form is submitted', () => {
    it('submits nothing where Sources apply no Classification just before, and holds it after', async () => {
        await open({selected: [CLASSIFIED]})
        await openRetrieve()
        expect(applyEnabled()).toBe(true)

        await act(async () => {
            actionBuilder('APPLY_SOURCES')
                .set(['process.loadedRecipes', ID, 'model.sources.classification'], null)
                .dispatch()
            requestSubmit()
        })
        await settled()

        expect(fake.submitted).toEqual([])
        expect(panelOpen()).toBe(true)
        expect(applyEnabled()).toBe(false)
    })

    it('submits nothing where the Classification is changed just before to a classifier that does not compute it', async () => {
        await open({selected: [NATIVE, CLASSIFIED]})
        await openRetrieve()
        expect(applyEnabled()).toBe(true)

        await act(async () => {
            actionBuilder('EDIT_CLASSIFIER')
                .set(['process.loadedRecipes', CLASSIFICATION, 'model.classifier'], SVM)
                .dispatch()
            requestSubmit()
        })
        await settled()
        expect(fake.submitted).toEqual([])
        expect(panelOpen()).toBe(true)

        await apply()
        expect(submittedIndicators()).toEqual([[NATIVE]])
    })
})

describe('Time Series Retrieve over a Classification that cannot be trained', () => {
    it('is not offered, and submits an indicator of the scenes once Sources select no Classification', async () => {
        await open({selected: [NATIVE], trainingData: []})
        expect(retrieveButton().disabled).toBe(true)

        await act(async () => actionBuilder('APPLY_SOURCES')
            .set(['process.loadedRecipes', ID, 'model.sources.classification'], null)
            .dispatch())
        await settled()
        await openRetrieve()
        await apply()

        expect(indicators()).toEqual([[NATIVE]])
    })
})

// An earlier release offered one indicator, and saved it as a value rather than a list: it opens selected, judged as any
// selection is, and is submitted as a list.
describe('Time Series Retrieve of the single indicator an earlier release saved', () => {
    it('submits one of the scenes as it stands', async () => {
        await open({selected: NATIVE, legacy: true})
        await openRetrieve()

        expect(applyEnabled()).toBe(true)
        await apply()

        expect(submittedIndicators()).toEqual([[NATIVE]])
    })

    it('is not offered while the Classification computing it stores no points, and submits it once it does', async () => {
        await open({selected: CLASSIFIED, legacy: true, trainingData: []})
        expect(retrieveButton().disabled).toBe(true)

        await holdTrainingData([COLLECTED])
        await openRetrieve()
        await apply()

        expect(submittedIndicators()).toEqual([[CLASSIFIED]])
    })

    it('holds one its Classification computes open, keeping it selected, until the imagery it needs is observed', async () => {
        await open({selected: CLASSIFIED, legacy: true})
        await openRetrieve()
        const observed = new Subject()
        inputBands$.mockReturnValue(observed)

        await holdInput(ASSET_INPUT)
        expect(applyEnabled()).toBe(false)
        expect(shown()).toContain('process.retrieve.form.bands.checking')

        await act(async () => observed.next(INPUT_BANDS))
        await settled()
        await apply()
        expect(submittedIndicators()).toEqual([[CLASSIFIED]])
    })
})

// Opened with no indicator selected yet, as a recipe never retrieved is.
// What is offered of a Classification the session does not hold is what the panel's read of the image output loaded,
// as it loads it for any Retrieve: nothing of the offer is read beside it.
describe('Time Series Retrieve over a Classification the session does not hold', () => {
    it('offers and submits an indicator it computes once the output read has loaded it', async () => {
        await open({selected: [CLASSIFIED], classificationHeld: false})
        await openRetrieve()

        expect(applyEnabled()).toBe(true)
        expect(select(['process.loadedRecipes', CLASSIFICATION])).toBeUndefined()
        await apply()

        expect(indicators()).toEqual([[CLASSIFIED]])
    })
})

describe('Time Series Retrieve opened with nothing selected', () => {
    it('names no indicator as unavailable, with a working Classification, and submits one once selected', async () => {
        await open({selected: undefined})
        await openRetrieve()

        expect(shown()).not.toContain('process.retrieve.form.bands.unavailable')
        expect(applyEnabled()).toBe(false)

        await click(NATIVE)
        expect(shown()).not.toContain('process.retrieve.form.bands.unavailable')
        await apply()
        expect(submittedIndicators()).toEqual([[NATIVE]])
    })
})

// The download is held to the image output (task/export/timeSeries.js, modules/gee), which the panel watches as any
// Retrieve does: nothing of its own beside it, whatever indicators are selected.
describe('what an open Time Series Retrieve watches', () => {
    it('is the image output alone, as any Retrieve watches it, whatever indicators are selected', async () => {
        await open({selected: [NATIVE]})
        expect(watchedOutputs()).toEqual([MARKS_QUESTION])
        await openRetrieve()
        expect(watchedOutputs()).toEqual([MARKS_QUESTION, RETRIEVE_QUESTION])

        await click(REGRESSION)
        expect(watchedOutputs()).toEqual([MARKS_QUESTION, RETRIEVE_QUESTION])
        expect(watchedOperations()).toEqual([])
    })

    it('is let go as the panel closes for a finding, leaving what SRC\'s mark reads, which offers Retrieve again once repaired without reading the imagery again', async () => {
        await open({selected: [NATIVE], input: ASSET_INPUT})
        await openRetrieve()
        const reads = inputBands$.mock.calls.length

        await holdTrainingData([])
        expect(panelOpen()).toBe(false)
        expect(watchedOutputs()).toEqual([MARKS_QUESTION])

        await holdTrainingData([COLLECTED])
        expect(retrieveButton().disabled).toBe(false)
        expect(inputBands$.mock.calls.length).toBe(reads)
    })
})

const ID = 'time-series-1'
const CLASSIFICATION = 'classification-1'
const MOSAIC = 'mosaic-1'
const PROJECT = 'project-1'
const NATIVE = 'ndvi'
const CLASSIFIED = 'regression'
const REGRESSION = 'process.classification.bands.regression'
const RADAR_FEATURES = ['VV_mean', 'VH_med']
const INPUT_BANDS = ['red', 'nir'].map(name => ({name, arrayDimensions: 0}))
const SVM = {type: 'SVM', svmType: 'C_SVC'}
const LEGEND = {entries: [{id: 'a', value: 1, label: 'Forest', color: '#000000'}, {id: 'b', value: 2, label: 'Other', color: '#ffffff'}]}
const COLLECTED = {dataSetId: 'collected', type: 'COLLECTED', name: 'Collected', referenceData: [{x: 1, y: 1, class: 1}, {x: 2, y: 2, class: 2}]}
const ADDED = {dataSetId: 'added', type: 'COLLECTED', name: 'Added', referenceData: [{x: 3, y: 3, class: 1}]}
const MOSAIC_INPUT = {imageId: 'i-1', type: 'RECIPE_REF', id: MOSAIC, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', class: 'IMAGE_BANDS', included: ['red', 'nir']}]}
const ASSET_INPUT = {imageId: 'i-1', type: 'ASSET', id: 'users/x/input', bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', class: 'IMAGE_BANDS', included: ['red', 'nir']}]}

const LISTING = [
    {id: ID, name: 'Series', type: 'TIME_SERIES', revision: 1},
    {id: CLASSIFICATION, name: 'Classification', type: 'CLASSIFICATION', revision: 1},
    {id: MOSAIC, name: 'Mosaic', type: 'MOSAIC', revision: 1}
]

// Over Landsat 8 scenes, its Sources selecting the Random Forest and having copied it when they did; Retrieve last asked
// for `bands`, to the user's files.
const seriesRecipe = bands => ({
    id: ID,
    type: 'TIME_SERIES',
    title: 'Series',
    projectId: PROJECT,
    revision: 1,
    model: {
        aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1]]},
        dates: {startDate: '2020-01-01', endDate: '2021-01-01'},
        sources: {dataSetType: 'OPTICAL', dataSets: {LANDSAT: ['LANDSAT_8']}, assets: [], classification: CLASSIFICATION},
        options: {corrections: ['SR']}
    },
    ui: {
        initialized: true,
        classification: {classificationLegend: LEGEND, classifierType: 'RANDOM_FOREST', classifier: {type: 'RANDOM_FOREST'}},
        retrieve: {
            ...(bands !== undefined && {bands}), scale: 30, tileSize: 2, shardSize: 256, fileDimensionsMultiple: 2,
            destination: 'SEPAL', workspacePath: 'downloads/series', filenamePrefix: 'series'
        }
    }
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

const buttons = () => [...document.querySelectorAll('button')]

const shown = () => document.body.textContent

const click = async label => {
    const button = buttons().find(button => button.textContent === label)
    expect(button, `no button labelled ${label}`).toBeDefined()
    await act(async () => button.click())
    await settled()
}

// The toolbar's Retrieve action.
const retrieveButton = () => document.querySelector('button[data-icon=cloud-download-alt]')

const openRetrieve = async () => {
    expect(retrieveButton().disabled, 'Retrieve is not offered').toBe(false)
    await act(async () => retrieveButton().click())
    await settled()
}

// Open as its action says it is, and shown.
const panelOpen = () => {
    const shownOpen = Boolean(applyButton())
    expect(retrieveButton().getAttribute('aria-pressed')).toBe(String(shownOpen))
    return shownOpen
}

const applyButton = () => buttons().find(button => button.textContent === 'process.retrieve.apply')

const applyEnabled = () => !applyButton().disabled

const apply = async () => {
    await act(async () => applyButton().click())
    await settled()
}

const formOf = () => document.querySelector('form')

const requestSubmit = () => formOf().requestSubmit
    ? formOf().requestSubmit()
    : formOf().dispatchEvent(new Event('submit', {cancelable: true}))

const indicators = () => fake.submitted.map(({params}) => [].concat(params.image.indicators))

// The indicators submitted, as they were sent.
const submittedIndicators = () => fake.submitted.map(({params}) => params.image.indicators)

// The retrieval settings the recipe keeps: those last submitted.
const savedSettings = () => select(['process.loadedRecipes', ID, 'ui.retrieve'])

// The sections the toolbar marks as needing attention.
const marked = () => Object.keys(JSON.parse(document.querySelector('output[aria-label=marks]').dataset.marks))

// The Classification's training data as the session holds it: saved, where it is open, as any edit of it is.
const holdTrainingData = async dataSets => {
    await act(async () => actionBuilder('EDIT_TRAINING_DATA')
        .set(['process.loadedRecipes', CLASSIFICATION, 'model.trainingData.dataSets'], dataSets)
        .dispatch())
    await settled()
}

// The bands the Classification's classifier reads of its input, as the session holds them.
const holdIncluded = async included => {
    await act(async () => actionBuilder('EDIT_INPUT')
        .set(['process.loadedRecipes', CLASSIFICATION, 'model.inputImagery.images', 0, 'bandSetSpecs', 0, 'included'], included)
        .dispatch())
    await settled()
}

// The Classification's input imagery, as the session holds it.
const holdInput = async input => {
    await act(async () => actionBuilder('EDIT_INPUT')
        .set(['process.loadedRecipes', CLASSIFICATION, 'model.inputImagery.images'], [input])
        .dispatch())
    await settled()
}

// The questions the runtime is asked to read, while they are asked.
const watched = []

// The operations of the questions watched about the time series.
const watchedOperations = () =>
    [...new Set(watched.filter(({recipeId, operation}) => recipeId === ID && operation).map(({operation}) => operation))]

// The output questions watched about the time series: the panel's, and the toolbar marks', which ask for an explanation.
const watchedOutputs = () => watched.filter(({recipeId, product}) => recipeId === ID && product)
const RETRIEVE_QUESTION = {recipeId: ID, product: {name: 'IMAGE_OUTPUT'}}
const MARKS_QUESTION = {recipeId: ID, product: {name: 'IMAGE_OUTPUT'}, explain: true}

// The runtime Retrieve is given, its watches recorded.
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

// The sections the toolbar marks, as it watches what marking them needs.
const SectionMarks = compose(
    ({sourceProblems}) => <output aria-label='marks' data-marks={JSON.stringify(tooltipText(sourceProblems))}/>,
    withSourceProblems(),
    withRecipe(recipe => ({recipeId: recipe.id}))
)

const settled = async () => {
    for (let i = 0; i < 8; i++) {
        await act(async () => {})
    }
}

// The recipes open in a tab whose saves are unacknowledged: on mounting, the session saves what it holds of them.
const saving = () => Object.entries(select('process.saveStates') || {})
    .filter(([_id, {status}]) => status === 'SAVING')
    .map(([id]) => id)

// `classificationOpen`: the Classification is open in a tab of its own, where it is edited and saved (saveRecipe$).
// `legacy`: the one indicator selected is saved as the value itself, as an earlier release saved it. Retrieve is
// offered beside the toolbar's marks within its set-up wizard, done, as the toolbar offers it, and is closed.
// `classificationHeld: false`: the session does not hold the Classification's record, which storage answers.
const open = async ({selected, legacy = false, input = MOSAIC_INPUT, trainingData = [COLLECTED], classificationOpen = false, classificationHeld = true}) => {
    const stored = [seriesRecipe(legacy || selected === undefined ? selected : [].concat(selected)), classificationRecipe({input, trainingData}), mosaicRecipe()]
    fake.stored = Object.fromEntries(stored.map(record => [record.id, record]))
    const records = classificationHeld ? stored : stored.filter(({id}) => id !== CLASSIFICATION)
    const initialState = {
        dimensions: {width: 1024, height: 768},
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: Object.fromEntries(records.map(record => [record.id, record])),
            tabs: [{id: ID}, ...(classificationOpen ? [{id: CLASSIFICATION}] : [])],
            saveStates: classificationOpen ? {[CLASSIFICATION]: {status: 'SAVED', revision: 1, model: records[1].model}} : {},
            recipes: LISTING,
            recipeListing: {checkedAt: Date.now()},
            projects: [{id: PROJECT, name: 'Project', defaultWorkspaceFolder: 'earlier'}]
        }
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    const container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(
        <Provider store={store}>
            <PortalContainer/>
            <PortalContainer id='test-portal'/>
            <PortalContext id='test-portal'>
                <EventShield>
                    <ActivationContext id='root'>
                        <SourceRuntimeProvider>
                            <RecordingWatches>
                                <Recipe id={ID}>
                                    <PanelWizard panels={['aoi', 'dates', 'sources']} initialized>
                                        <SectionMarks/>
                                        <RetrieveButton/>
                                        <Retrieve/>
                                    </PanelWizard>
                                </Recipe>
                            </RecordingWatches>
                        </SourceRuntimeProvider>
                    </ActivationContext>
                </EventShield>
            </PortalContext>
        </Provider>
    ))
    await settled()
    await vi.waitFor(() => expect(saving()).toEqual([]))
}
