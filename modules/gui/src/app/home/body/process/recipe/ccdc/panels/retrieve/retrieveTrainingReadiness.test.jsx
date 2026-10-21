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

// What CCDC Retrieve holds a selection of measures to beyond its image output, as the server holds the export
// (requireCcdcImageStages$, modules/gee): while what CCDC fits for them - with its breakpoint bands - includes an output
// the selected Classification computes, that Classification's training (the collection classified). A hold keeps the
// selection and says why where something is found wrong; nothing is submitted while it holds, by Apply or by the form
// itself, judged from the session as it stands when submitted, and the project's destination is left as it was.
// Selecting only measures of the scenes lets go of what training needs. The registrations, runtime, form, panel and
// submission are real; storage, Earth Engine, task submission and the asset destination's check are the substitutes.

const {inputBands$, saveRecipe$} = vi.hoisted(() => ({inputBands$: vi.fn(), saveRecipe$: vi.fn()}))
const fake = vi.hoisted(() => ({stored: {}, submitted: [], projects: []}))
vi.mock('~/apiRegistry', () => ({default: {
    gee: {
        assetVersions$: ({ids}) => of({assets: ids.map(id => ({id, type: 'IMAGE', version: 'v1'}))}),
        bands$: ({recipe, asset}) => recipe ? of(CCDC_BANDS) : inputBands$(asset)
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
vi.mock('~/user', () => ({isGoogleAccount: () => true}))
vi.mock('~/eventPublisher', () => ({publishEvent: () => {}}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
vi.mock('~/widget/tooltip', () => ({Tooltip: ({children}) => children}))
vi.mock('~/widget/activation/activatable', () => ({
    withActivatable: () => Component => props => (
        <Component {...props} activatable={{active: true, activate: () => {}, deactivate: () => {}}}/>
    )
}))
// The asset destination checks the user's assets: it reports that its check has settled.
vi.mock('~/widget/assetDestination', () => ({
    AssetDestination: ({onValidityCheckChange}) => {
        useEffect(() => onValidityCheckChange(false), [])
        return null
    }
}))

const {addRecipeType} = await import('../../../../recipeTypeRegistry')
const {default: ccdc} = await import('../../ccdc')
const {default: classification} = await import('../../../classification/classification')
const {default: opticalMosaic} = await import('../../../opticalMosaic/opticalMosaic')
const {Retrieve} = await import('./retrieve')
const {forgetRecipeSaveState} = await import('~/app/home/body/process/recipe')

addRecipeType(ccdc())
addRecipeType(classification())
addRecipeType(opticalMosaic())

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, store

beforeEach(() => {
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']})
    inputBands$.mockReset().mockReturnValue(of(['red', 'nir'].map(name => ({name, arrayDimensions: 0}))))
    saveRecipe$.mockReset().mockReturnValue(of({revision: 2}))
    fake.submitted = []
    fake.projects = []
    watched.length = 0
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    document.body.innerHTML = ''
    // The session's saves outlive a test: what one acknowledged is not the next one's storage.
    ;[CCDC, CLASSIFICATION, MOSAIC].forEach(forgetRecipeSaveState)
    vi.useRealTimers()
})

describe('CCDC Retrieve of a measure its Classification computes', () => {
    it('holds it, saying why, while that Classification stores no points, however the form is submitted', async () => {
        await open({selected: [CLASSIFIED], trainingData: []})

        expect(applyEnabled()).toBe(false)
        expect(shown()).toContain('process.retrieve.form.bands.classifiedWithheld')
        await apply()
        await submitForm()
        expect(fake.submitted).toEqual([])
        expect(fake.projects).toEqual([])
        expect(selectedMeasures()).toEqual([CLASSIFIED])
    })

    it('holds it beside a measure of the scenes, submitting the latter alone once the classified one is let go', async () => {
        await open({selected: [NATIVE, CLASSIFIED], trainingData: []})
        expect(applyEnabled()).toBe(false)

        await click(REGRESSION)
        await apply()

        expect(measures()).toEqual([[NATIVE]])
    })

    it('submits it once the Classification stores points again, to the asset and with the options chosen', async () => {
        await open({selected: [NATIVE, CLASSIFIED], trainingData: []})

        await holdTrainingData([COLLECTED])
        await apply()

        expect(measures()).toEqual([[NATIVE, CLASSIFIED]])
        const [{operation, params: {image}}] = fake.submitted
        expect(operation).toBe('ccdc.GEE')
        expect(image).toMatchObject({
            recipe: {id: CCDC},
            destination: 'GEE',
            assetId: ASSET_ID,
            assetType: 'ImageCollection',
            sharing: 'PRIVATE',
            strategy: 'new',
            scale: 30,
            tileSize: 0.5
        })
        expect(fake.projects).toMatchObject([{id: PROJECT, defaultAssetFolder: 'projects/p/assets'}])
    })

    it('waits for the points it is given to be saved, submitting it once storage holds them', async () => {
        await open({selected: [CLASSIFIED], trainingData: [], classificationOpen: true})
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
        expect(measures()).toEqual([[CLASSIFIED]])
    })

    it('submits nothing where the Classification loses its points just before the form is submitted, though the panel has not shown it', async () => {
        await open({selected: [CLASSIFIED]})
        expect(applyEnabled()).toBe(true)

        await act(async () => {
            actionBuilder('EDIT_TRAINING_DATA')
                .set(['process.loadedRecipes', CLASSIFICATION, 'model.trainingData.dataSets'], [])
                .dispatch()
            formOf().requestSubmit ? formOf().requestSubmit() : formOf().dispatchEvent(new Event('submit', {cancelable: true}))
        })
        await settled()

        expect(fake.submitted).toEqual([])
        expect(fake.projects).toEqual([])
    })
})

describe('CCDC Retrieve of a measure its Classification computes over imagery still to be observed', () => {
    it('holds it, saying nothing is wrong and keeping it selected, until that imagery is observed, then submits it', async () => {
        const observed = new Subject()
        inputBands$.mockReturnValue(observed)
        await open({selected: [CLASSIFIED], input: ASSET_INPUT})

        expect(applyEnabled()).toBe(false)
        expect(shown()).toContain('process.retrieve.form.bands.checking')
        expect(shown()).not.toContain('process.retrieve.form.bands.classifiedWithheld')
        expect(selectedMeasures()).toEqual([CLASSIFIED])

        await act(async () => observed.next(['red', 'nir'].map(name => ({name, arrayDimensions: 0}))))
        await settled()
        await apply()
        expect(measures()).toEqual([[CLASSIFIED]])
    })

    it('holds it, finding nothing, where that imagery cannot be observed', async () => {
        inputBands$.mockReturnValue(throwError(() => new Error('Earth Engine unreachable')))
        await open({selected: [CLASSIFIED], input: ASSET_INPUT})

        await apply()

        expect(fake.submitted).toEqual([])
        expect(shown()).toContain('process.retrieve.form.bands.uncheckable')
        expect(shown()).not.toContain('process.retrieve.form.bands.classifiedWithheld')
    })

    it('submits a measure of the scenes without waiting for it', async () => {
        inputBands$.mockReturnValue(new Subject())
        await open({selected: [NATIVE], input: ASSET_INPUT})

        await apply()

        expect(measures()).toEqual([[NATIVE]])
    })
})

// A breakpoint band is fitted whatever is selected, so the image output itself needs that Classification's training.
describe('CCDC Retrieve fitting a breakpoint band its Classification computes', () => {
    it('is held by its image output, saying where, for a measure of the scenes, and submits it once repaired', async () => {
        await open({selected: [NATIVE], breakpointBands: [NATIVE, CLASSIFIED], trainingData: []})

        expect(applyEnabled()).toBe(false)
        expect(shown()).toContain('process.retrieve.source.unsuitable')
        expect(shown()).not.toContain('process.retrieve.form.bands.classifiedWithheld')
        await submitForm()
        expect(fake.submitted).toEqual([])

        await holdTrainingData([COLLECTED])
        await apply()
        expect(measures()).toEqual([[NATIVE]])
    })
})

// The questions watched are those the export is held to beyond its image output, which the panel itself watches.
describe('what an open CCDC Retrieve watches', () => {
    it('is nothing more for measures of the scenes, the collection classified for one the Classification computes or fits as a breakpoint band, let go with it and with the panel', async () => {
        await open({selected: [NATIVE]})
        expect(watchedOperations()).toEqual([])

        await click(REGRESSION)
        expect(watchedOperations()).toEqual(['CLASSIFIED_COLLECTION'])

        await click(REGRESSION)
        expect(watchedOperations()).toEqual([])

        await holdBreakpointBands([NATIVE, CLASSIFIED])
        expect(watchedOperations()).toEqual(['CLASSIFIED_COLLECTION'])

        await holdBreakpointBands([NATIVE])
        expect(watchedOperations()).toEqual([])

        await click(REGRESSION)
        await act(async () => root.unmount())
        root = null
        expect(watched).toEqual([])
    })
})

const CCDC = 'ccdc-1'
const CLASSIFICATION = 'classification-1'
const MOSAIC = 'mosaic-1'
const PROJECT = 'project-1'
const ASSET_ID = 'projects/p/assets/ccdc'
const NATIVE = 'ndvi'
const CLASSIFIED = 'regression'
const REGRESSION = 'process.classification.bands.regression'
const CCDC_BANDS = [
    'tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb',
    ...[NATIVE, 'swir1', CLASSIFIED].flatMap(measure => ['coefs', 'rmse', 'magnitude'].map(suffix => `${measure}_${suffix}`))
]
const LEGEND = {entries: [{id: 'a', value: 1, label: 'Forest', color: '#000000'}, {id: 'b', value: 2, label: 'Other', color: '#ffffff'}]}
const COLLECTED = {dataSetId: 'collected', type: 'COLLECTED', name: 'Collected', referenceData: [{x: 1, y: 1, class: 1}, {x: 2, y: 2, class: 2}]}
const MOSAIC_INPUT = {imageId: 'i-1', type: 'RECIPE_REF', id: MOSAIC, bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', class: 'IMAGE_BANDS', included: ['red', 'nir']}]}
const ASSET_INPUT = {imageId: 'i-1', type: 'ASSET', id: 'users/x/input', bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', class: 'IMAGE_BANDS', included: ['red', 'nir']}]}

const LISTING = [
    {id: CCDC, name: 'CCDC', type: 'CCDC', revision: 1},
    {id: CLASSIFICATION, name: 'Classification', type: 'CLASSIFICATION', revision: 1},
    {id: MOSAIC, name: 'Mosaic', type: 'MOSAIC', revision: 1}
]

// Over Landsat 8 scenes, its Sources selecting the Random Forest and having copied it when they did, fitting the
// breakpoint bands given; Retrieve last asked for `selected`, to an asset.
const ccdcRecipe = ({selected, breakpointBands}) => ({
    id: CCDC,
    type: 'CCDC',
    title: 'CCDC',
    projectId: PROJECT,
    revision: 1,
    model: {
        aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1]]},
        dates: {startDate: '2020-01-01', endDate: '2021-01-01'},
        sources: {dataSetType: 'OPTICAL', classification: CLASSIFICATION, dataSets: {LANDSAT: ['LANDSAT_8']}, assets: [], cloudPercentageThreshold: 75, breakpointBands},
        options: {corrections: ['SR']},
        opticalPreprocess: {corrections: ['SR']},
        ccdcOptions: {dateFormat: 1}
    },
    ui: {
        initialized: true,
        classification: {classificationLegend: LEGEND, classifierType: 'RANDOM_FOREST', classifier: {type: 'RANDOM_FOREST'}},
        retrieve: {
            bands: selected, scale: 30, tileSize: 0.5, shardSize: 256, fileDimensionsMultiple: 10, crs: 'EPSG:4326',
            destination: 'GEE', assetType: 'ImageCollection', assetId: ASSET_ID, sharing: 'PRIVATE', strategy: 'new'
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

const measures = () => fake.submitted.map(({params}) => params.image.bands)

// The measures the form holds selected.
const selectedMeasures = () => [].concat(select(['process.loadedRecipes', CCDC, 'ui.retrieve.bands']) ?? [])

// The Classification's training data as the session holds it: saved, where it is open, as any edit of it is.
const holdTrainingData = async dataSets => {
    await act(async () => actionBuilder('EDIT_TRAINING_DATA')
        .set(['process.loadedRecipes', CLASSIFICATION, 'model.trainingData.dataSets'], dataSets)
        .dispatch())
    await settled()
}

// The breakpoint bands the CCDC's Sources apply.
const holdBreakpointBands = async breakpointBands => {
    await act(async () => actionBuilder('APPLY_BREAKPOINT_BANDS')
        .set(['process.loadedRecipes', CCDC, 'model.sources.breakpointBands'], breakpointBands)
        .dispatch())
    await settled()
}

// The questions the runtime is asked to read, while they are asked.
const watched = []

// The operations of the questions watched about the CCDC.
const watchedOperations = () =>
    [...new Set(watched.filter(({recipeId, operation}) => recipeId === CCDC && operation).map(({operation}) => operation))]

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
const open = async ({selected, breakpointBands = [NATIVE], input = MOSAIC_INPUT, trainingData = [COLLECTED], classificationOpen = false}) => {
    const records = [ccdcRecipe({selected, breakpointBands}), classificationRecipe({input, trainingData}), mosaicRecipe()]
    fake.stored = Object.fromEntries(records.map(record => [record.id, record]))
    const initialState = {
        dimensions: {width: 1024, height: 768},
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: Object.fromEntries(records.map(record => [record.id, record])),
            tabs: [{id: CCDC}, ...(classificationOpen ? [{id: CLASSIFICATION}] : [])],
            saveStates: classificationOpen ? {[CLASSIFICATION]: {status: 'SAVED', revision: 1, model: records[1].model}} : {},
            recipes: LISTING,
            recipeListing: {checkedAt: Date.now()},
            projects: [{id: PROJECT, name: 'Project', defaultAssetFolder: 'projects/p/assets/earlier'}]
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
                            <Recipe id={CCDC}>
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
    await act(async () => vi.advanceTimersByTime(MINIMUM_LOADING_MS + 50))
    await settled()
}

// The panel opens on a loading view held for a minimum, which a scenario about the form waits out.
const MINIMUM_LOADING_MS = 500
