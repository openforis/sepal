import {act, useEffect} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {defer, finalize, of, Subject, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {actionBuilder} from '~/action-builder'
import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider, useSourceRuntime} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {initStore, select} from '~/store'
import {EventShield} from '~/widget/eventShield'
import {PortalContainer, PortalContext} from '~/widget/portal'

// What Time Series Retrieve holds a selection to, as the server holds the download (task/export/timeSeries.js): what
// the recipe's image output requires, whatever indicators are selected, and - while an indicator the selected
// Classification computes is among them - that Classification's training (the collection classified). A hold keeps the
// selection and says why where something is found wrong; nothing is submitted while it holds, by Apply or by the form
// itself, judged from the session as it stands when submitted. Selecting only indicators of the scenes lets go of what
// training needs. The registrations, runtime, form, panel and submission are real; storage, Earth Engine, task
// submission and the workspace destination's check are the substitutes.

const {inputBands$, saveRecipe$} = vi.hoisted(() => ({inputBands$: vi.fn(), saveRecipe$: vi.fn()}))
const fake = vi.hoisted(() => ({stored: {}, submitted: []}))
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
vi.mock('~/widget/activation/activatable', () => ({
    withActivatable: () => Component => props => (
        <Component {...props} activatable={{active: true, activate: () => {}, deactivate: () => {}}}/>
    )
}))
// The workspace destination checks the user's files: it names a folder and reports that its check has settled.
vi.mock('~/widget/workspaceDestination', () => ({
    WorkspaceDestination: ({workspacePathInput, onValidityCheckChange}) => {
        useEffect(() => {
            workspacePathInput.set('downloads/series')
            onValidityCheckChange(false)
        }, [])
        return null
    }
}))

const {addRecipeType} = await import('../../../../recipeTypeRegistry')
const {default: timeSeries} = await import('../../timeSeries')
const {default: classification} = await import('../../../classification/classification')
const {default: opticalMosaic} = await import('../../../opticalMosaic/opticalMosaic')
const {Retrieve} = await import('./retrieve')

addRecipeType(timeSeries())
addRecipeType(classification())
addRecipeType(opticalMosaic())

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, store

beforeEach(() => {
    inputBands$.mockReset().mockReturnValue(of(['red', 'nir'].map(name => ({name, arrayDimensions: 0}))))
    saveRecipe$.mockReset().mockReturnValue(of({revision: 2}))
    fake.submitted = []
    watched.length = 0
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    document.body.innerHTML = ''
})

describe('Time Series Retrieve of an indicator its Classification computes', () => {
    it('holds it, saying why, while that Classification stores no points, however the form is submitted', async () => {
        await open({selected: CLASSIFIED, trainingData: []})

        expect(applyEnabled()).toBe(false)
        expect(shown()).toContain('process.retrieve.form.bands.classifiedWithheld')
        await apply()
        await submitForm()
        expect(fake.submitted).toEqual([])
        expect(selectedIndicators()).toEqual([CLASSIFIED])
    })

    it('holds it beside an indicator of the scenes, submitting the latter alone once the classified one is let go', async () => {
        await open({selected: [NATIVE, CLASSIFIED], trainingData: []})
        expect(applyEnabled()).toBe(false)

        await click(REGRESSION)
        await apply()

        expect(indicators()).toEqual([[NATIVE]])
    })

    it('submits it once the Classification stores points again', async () => {
        await open({selected: CLASSIFIED, trainingData: []})

        await holdTrainingData([COLLECTED])
        await apply()

        expect(indicators()).toEqual([[CLASSIFIED]])
    })

    it('waits for the points it is given to be saved, submitting it once storage holds them', async () => {
        await open({selected: CLASSIFIED, trainingData: [], classificationOpen: true})
        const save = new Subject()
        saveRecipe$.mockReturnValueOnce(save)
        const saves = saveRecipe$.mock.calls.length

        await holdTrainingData([COLLECTED])
        await vi.waitFor(() => expect(saveRecipe$.mock.calls.length).toBe(saves + 1))
        await settled()
        expect(applyEnabled()).toBe(false)
        await submitForm()
        expect(fake.submitted).toEqual([])

        await act(async () => {
            save.next({revision: 2})
            save.complete()
        })
        await settled()
        await apply()
        expect(indicators()).toEqual([[CLASSIFIED]])
    })

    it('submits nothing where the Classification loses its points just before the form is submitted, though the panel has not shown it', async () => {
        await open({selected: CLASSIFIED})
        expect(applyEnabled()).toBe(true)

        await act(async () => {
            actionBuilder('EDIT_TRAINING_DATA')
                .set(['process.loadedRecipes', CLASSIFICATION, 'model.trainingData.dataSets'], [])
                .dispatch()
            formOf().requestSubmit ? formOf().requestSubmit() : formOf().dispatchEvent(new Event('submit', {cancelable: true}))
        })
        await settled()

        expect(fake.submitted).toEqual([])
    })
})

// What is offered is judged at submission as the session then holds it, not as the panel last rendered it.
describe('Time Series Retrieve of an indicator no longer offered when the form is submitted', () => {
    it('submits nothing where Sources apply no Classification just before, and holds it after', async () => {
        await open({selected: CLASSIFIED})
        expect(applyEnabled()).toBe(true)

        await act(async () => {
            actionBuilder('APPLY_SOURCES')
                .set(['process.loadedRecipes', ID, 'model.sources.classification'], null)
                .dispatch()
            formOf().requestSubmit ? formOf().requestSubmit() : formOf().dispatchEvent(new Event('submit', {cancelable: true}))
        })
        await settled()

        expect(fake.submitted).toEqual([])
        expect(applyEnabled()).toBe(false)
    })

    it('submits nothing where the Classification is changed just before to a classifier that does not compute it', async () => {
        await open({selected: [NATIVE, CLASSIFIED]})
        expect(applyEnabled()).toBe(true)

        await act(async () => {
            actionBuilder('EDIT_CLASSIFIER')
                .set(['process.loadedRecipes', CLASSIFICATION, 'model.classifier'], SVM)
                .dispatch()
            formOf().requestSubmit ? formOf().requestSubmit() : formOf().dispatchEvent(new Event('submit', {cancelable: true}))
        })
        await settled()
        expect(fake.submitted).toEqual([])

        await apply()
        expect(submittedIndicators()).toEqual([[NATIVE]])
    })
})

describe('Time Series Retrieve of an indicator its Classification computes over imagery still to be observed', () => {
    it('holds it, saying nothing is wrong, until that imagery is observed, then submits it', async () => {
        const observed = new Subject()
        inputBands$.mockReturnValue(observed)
        await open({selected: CLASSIFIED, input: ASSET_INPUT})

        expect(applyEnabled()).toBe(false)
        expect(shown()).toContain('process.retrieve.form.bands.checking')
        expect(shown()).not.toContain('process.retrieve.form.bands.classifiedWithheld')

        await act(async () => observed.next(['red', 'nir'].map(name => ({name, arrayDimensions: 0}))))
        await settled()
        await apply()
        expect(indicators()).toEqual([[CLASSIFIED]])
    })

    it('holds it, finding nothing, where that imagery cannot be observed', async () => {
        inputBands$.mockReturnValue(throwError(() => new Error('Earth Engine unreachable')))
        await open({selected: CLASSIFIED, input: ASSET_INPUT})

        await apply()

        expect(fake.submitted).toEqual([])
        expect(shown()).not.toContain('process.retrieve.form.bands.classifiedWithheld')
    })

    it('submits an indicator of the scenes without waiting for it', async () => {
        inputBands$.mockReturnValue(new Subject())
        await open({selected: NATIVE, input: ASSET_INPUT})

        await apply()

        expect(indicators()).toEqual([[NATIVE]])
    })
})

// What Retrieve is held to whatever indicators it names, found after it opened.
describe('an open Time Series Retrieve whose image output can no longer run', () => {
    it('holds an indicator of the scenes, saying where, however the form is submitted, and submits it once repaired', async () => {
        await open({selected: NATIVE})
        expect(applyEnabled()).toBe(true)

        await holdIncluded(RADAR_FEATURES)

        expect(applyEnabled()).toBe(false)
        expect(shown()).toContain('process.retrieve.source.configurationUnmet')
        await submitForm()
        expect(fake.submitted).toEqual([])

        await holdIncluded(['red', 'nir'])
        await apply()
        expect(indicators()).toEqual([[NATIVE]])
    })
})

// An earlier release offered one indicator, and saved it as a value rather than a list: it opens selected, judged as any
// selection is, and is submitted as a list.
describe('Time Series Retrieve of the single indicator an earlier release saved', () => {
    it('submits one of the scenes as it stands', async () => {
        await open({selected: NATIVE, legacy: true})

        expect(applyEnabled()).toBe(true)
        await apply()

        expect(submittedIndicators()).toEqual([[NATIVE]])
    })

    it('holds one its Classification computes, saying why, while that Classification stores no points, and submits it once it does', async () => {
        await open({selected: CLASSIFIED, legacy: true, trainingData: []})

        expect(applyEnabled()).toBe(false)
        expect(shown()).toContain('process.retrieve.form.bands.classifiedWithheld')
        await submitForm()
        expect(fake.submitted).toEqual([])

        await holdTrainingData([COLLECTED])
        await apply()
        expect(submittedIndicators()).toEqual([[CLASSIFIED]])
    })

    it('holds one its Classification computes, keeping it selected, until the imagery it needs is observed', async () => {
        const observed = new Subject()
        inputBands$.mockReturnValue(observed)
        await open({selected: CLASSIFIED, legacy: true, input: ASSET_INPUT})

        expect(applyEnabled()).toBe(false)
        expect(shown()).toContain('process.retrieve.form.bands.checking')

        await act(async () => observed.next(['red', 'nir'].map(name => ({name, arrayDimensions: 0}))))
        await settled()
        await apply()
        expect(submittedIndicators()).toEqual([[CLASSIFIED]])
    })
})

// Opened with no indicator selected yet, as a recipe never retrieved is.
describe('Time Series Retrieve opened with nothing selected', () => {
    for (const [_case, trainingData] of [['with a working Classification', [COLLECTED]], ['over a Classification without points', []]]) {
        it(`names no indicator as unavailable, ${_case}, and submits one once selected`, async () => {
            await open({selected: undefined, trainingData})

            expect(shown()).not.toContain('process.retrieve.form.bands.unavailable')
            expect(applyEnabled()).toBe(false)

            await click(NATIVE)
            expect(shown()).not.toContain('process.retrieve.form.bands.unavailable')
            await apply()
            expect(submittedIndicators()).toEqual([[NATIVE]])
        })
    }
})

// The questions watched are those the download is held to (task/export/timeSeries.js, modules/gee).
describe('what an open Time Series Retrieve watches', () => {
    it('is the image output alone for indicators of the scenes, the collection classified beside it for one the Classification computes, let go with it and with the panel', async () => {
        await open({selected: NATIVE})
        expect(watchedOperations()).toEqual(['IMAGE_OUTPUT'])

        await click(REGRESSION)
        expect(watchedOperations()).toEqual(['IMAGE_OUTPUT', 'CLASSIFIED_COLLECTION'])

        await click(REGRESSION)
        expect(watchedOperations()).toEqual(['IMAGE_OUTPUT'])

        await act(async () => root.unmount())
        root = null
        expect(watched).toEqual([])
    })
})

const ID = 'time-series-1'
const CLASSIFICATION = 'classification-1'
const MOSAIC = 'mosaic-1'
const NATIVE = 'ndvi'
const CLASSIFIED = 'regression'
const REGRESSION = 'process.classification.bands.regression'
const RADAR_FEATURES = ['VV_mean', 'VH_med']
const SVM = {type: 'SVM', svmType: 'C_SVC'}
const LEGEND = {entries: [{id: 'a', value: 1, label: 'Forest', color: '#000000'}, {id: 'b', value: 2, label: 'Other', color: '#ffffff'}]}
const COLLECTED = {dataSetId: 'collected', type: 'COLLECTED', name: 'Collected', referenceData: [{x: 1, y: 1, class: 1}, {x: 2, y: 2, class: 2}]}
const MOSAIC_INPUT = {imageId: 'i-1', type: 'RECIPE_REF', id: MOSAIC, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', class: 'IMAGE_BANDS', included: ['red', 'nir']}]}
const ASSET_INPUT = {imageId: 'i-1', type: 'ASSET', id: 'users/x/input', bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', class: 'IMAGE_BANDS', included: ['red', 'nir']}]}

const LISTING = [
    {id: ID, name: 'Series', type: 'TIME_SERIES', revision: 1},
    {id: CLASSIFICATION, name: 'Classification', type: 'CLASSIFICATION', revision: 1},
    {id: MOSAIC, name: 'Mosaic', type: 'MOSAIC', revision: 1}
]

// Over Landsat 8 scenes, its Sources selecting the Random Forest and having copied it when they did; Retrieve last asked
// for `bands`.
const seriesRecipe = bands => ({
    id: ID,
    type: 'TIME_SERIES',
    title: 'Series',
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
        retrieve: {...(bands !== undefined && {bands}), scale: 30, tileSize: 2, shardSize: 256, fileDimensionsMultiple: 2, destination: 'SEPAL', filenamePrefix: 'series'}
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

const applyButton = () => buttons().find(button => button.textContent === 'process.retrieve.apply')

const applyEnabled = () => !applyButton().disabled

const apply = async () => {
    await act(async () => applyButton().click())
    await settled()
}

const formOf = () => document.querySelector('form')

const submitForm = async () => {
    await act(async () => formOf().requestSubmit ? formOf().requestSubmit() : formOf().dispatchEvent(new Event('submit', {cancelable: true})))
    await settled()
}

const indicators = () => fake.submitted.map(({params}) => [].concat(params.image.indicators))

// The indicators submitted, as they were sent.
const submittedIndicators = () => fake.submitted.map(({params}) => params.image.indicators)

// The indicators the form holds selected.
const selectedIndicators = () => [].concat(select(['process.loadedRecipes', ID, 'ui.retrieve.bands']) ?? [])

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

// The questions the runtime is asked to read, while they are asked.
const watched = []

// The operations of the questions watched about the time series.
const watchedOperations = () =>
    [...new Set(watched.filter(({recipeId, operation}) => recipeId === ID && operation).map(({operation}) => operation))]

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
// `legacy`: the one indicator selected is saved as the value itself, as an earlier release saved it.
const open = async ({selected, legacy = false, input = MOSAIC_INPUT, trainingData = [COLLECTED], classificationOpen = false}) => {
    const records = [seriesRecipe(legacy || selected === undefined ? selected : [].concat(selected)), classificationRecipe({input, trainingData}), mosaicRecipe()]
    fake.stored = Object.fromEntries(records.map(record => [record.id, record]))
    const initialState = {
        dimensions: {width: 1024, height: 768},
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: Object.fromEntries(records.map(record => [record.id, record])),
            tabs: [{id: ID}, ...(classificationOpen ? [{id: CLASSIFICATION}] : [])],
            saveStates: classificationOpen ? {[CLASSIFICATION]: {status: 'SAVED', revision: 1, model: records[1].model}} : {},
            recipes: LISTING,
            recipeListing: {checkedAt: Date.now()},
            projects: []
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
                    <SourceRuntimeProvider>
                        <RecordingWatches>
                            <Recipe id={ID}>
                                <Retrieve/>
                            </Recipe>
                        </RecordingWatches>
                    </SourceRuntimeProvider>
                </EventShield>
            </PortalContext>
        </Provider>
    ))
    await settled()
    await vi.waitFor(() => expect(saving()).toEqual([]))
}
