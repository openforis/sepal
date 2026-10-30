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

// What CCDC Retrieve is held to, as the server holds the export (imageOutput.js, modules/gee): its image output - the
// Classification its Sources select trainable among it, whatever measures are selected or breakpoint bands fitted
// (type/ccdc.js). Once that is found not to hold, an open Retrieve closes, as a chart does, and its action is disabled
// while SRC, where it is repaired, says why; repair offers it again, opening on what was last submitted. What is still
// being read, or cannot be, and a save not yet acknowledged, hold the export with the panel open, keeping the selection,
// as a selection or asset the form leaves incomplete does. Nothing is submitted while held, by Apply or by the form
// itself, judged from the session as it stands when submitted, and the project's destination is left as it was. The
// registrations, runtime, activation, Retrieve action, section marks, form, panel and submission are real; storage,
// Earth Engine, task submission and the asset destination's check are the substitutes.

const {inputBands$, saveRecipe$} = vi.hoisted(() => ({inputBands$: vi.fn(), saveRecipe$: vi.fn()}))
const fake = vi.hoisted(() => ({stored: {}, submitted: [], projects: [], assetId: null}))
vi.mock('~/apiRegistry', () => ({default: {
    gee: {
        assetVersions$: ({ids}) => of({assets: ids.map(id => ({id, type: 'IMAGE', version: 'v1'}))}),
        bands$: ({recipe, asset}) => recipe ? of(CCDC_BANDS) : inputBands$(asset)
    },
    recipe: {
        load$: id => of(fake.stored[id]),
        loadAll$: () => of(fake.creation ? Object.values(fake.stored).map(({id, type, revision, projectId}) => ({id, type, revision, projectId, name: id})) : LISTING),
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
// A toolbar button is pressed by its icon; it says whether what it opens is open.
vi.mock('~/widget/toolbar/toolbarButton', () => ({
    ToolbarButton: ({icon, disabled, selected, onClick}) =>
        <button data-icon={icon} aria-pressed={Boolean(selected)} disabled={disabled} onClick={onClick}/>
}))
// The asset destination checks the user's assets: it reports that its check has settled, and is handed its input to
// name another.
vi.mock('~/widget/assetDestination', () => ({
    AssetDestination: ({assetInput, onValidityCheckChange}) => {
        fake.assetId = assetInput
        useEffect(() => onValidityCheckChange(false), [])
        return null
    }
}))

const {addRecipeType} = await import('../../../../recipeTypeRegistry')
const {default: ccdc} = await import('../../ccdc')
const {default: changeAlerts} = await import('../../../changeAlerts/changeAlerts')
const {Retrieve: AlertsRetrieve} = await import('../../../changeAlerts/panels/retrieve/retrieve')
const {Reference} = await import('../../../changeAlerts/panels/reference/reference')
const {Date: AlertsDate} = await import('../../../changeAlerts/panels/date/date')
const {default: classification} = await import('../../../classification/classification')
const {default: opticalMosaic} = await import('../../../opticalMosaic/opticalMosaic')
const {RetrieveButton} = await import('../../../retrieveButton')
const {withSourceProblems} = await import('../../../selectedSource')
const {Retrieve} = await import('./retrieve')
const {Sources: CcdcSources} = await import('../sources/sources')
const {Dates: CcdcDates} = await import('../dates/dates')
const {forgetRecipeSaveState} = await import('~/app/home/body/process/recipe')

addRecipeType(ccdc())
addRecipeType(changeAlerts())
addRecipeType(classification())
addRecipeType(opticalMosaic())

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, store
let firstListener = () => {}

beforeEach(() => {
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']})
    inputBands$.mockReset().mockReturnValue(of(INPUT_BANDS))
    saveRecipe$.mockReset().mockReturnValue(of({revision: 2}))
    fake.submitted = []
    fake.projects = []
    fake.assetId = null
    fake.creation = false
    firstListener = () => {}
    fake.wizardDone = 0
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

// Read as the suites are defined.
const CLASSIFIED_MEASURE = 'regression'
const NATIVE_MEASURE = 'ndvi'

describe('the actual CCDC Classification selection wizard', () => {
    it.each([
        [['sources', 'dates'], 'button.next', true, true],
        [['sources'], 'button.done', true, true],
        [['sources', 'dates'], 'button.next', false, false],
        [['sources'], 'button.done', false, false]
    ])('refuses the unusable Classification in %j before saving or advancing, and proceeds after repair', async (panels, forward, multiple, hasPoints) => {
        const trainingData = hasPoints ? [COLLECTED] : []
        await open({selected: [NATIVE], creation: panels, sourcesWizard: true, multiple, trainingData})
        const original = select(['process.loadedRecipes', CCDC, 'model'])
        await selectInField('process.ccdc.panel.sources.form.classification.label', CLASSIFICATION)
        expect(button(forward).disabled).toBe(true)
        expect(document.querySelector('[data-label="process.ccdc.panel.sources.form.classification.label"] [data-feedback="error"]')).not.toBe(null)
        await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true})))
        await act(async () => requestSubmit())
        await settled()
        expect(select(['process.loadedRecipes', CCDC, 'model'])).toBe(original)
        expect(fake.wizardDone).toBe(0)
        await holdInput(MOSAIC_INPUT)
        await holdTrainingData([COLLECTED])
        expect(button(forward).disabled).toBe(false)
        await click(forward)
        expect(select(['process.loadedRecipes', CCDC, 'model.sources.classification'])).toBe(CLASSIFICATION)
        expect(document.querySelector('[data-label="process.ccdc.panel.sources.form.classification.label"]')).toBe(null)
    })

    it('accepts a usable Classification replacement for the refused one', async () => {
        await open({selected: [NATIVE], creation: ['sources'], sourcesWizard: true, multiple: true})
        await selectInField('process.ccdc.panel.sources.form.classification.label', CLASSIFICATION)
        expect(button('button.done').disabled).toBe(true)
        await selectInField('process.ccdc.panel.sources.form.classification.label', 'healthy-classification')
        expect(button('button.done').disabled).toBe(false)
        await click('button.done')
        expect(select(['process.loadedRecipes', CCDC, 'model.sources.classification'])).toBe('healthy-classification')
        expect(fake.wizardDone).toBe(1)
    })
})

describe('the actual Change Alerts creation wizard', () => {
    it.each([
        [['reference', 'date'], 'button.next'],
        [['reference'], 'button.done']
    ])('blocks a confirmed broken reference in %j through buttons, Enter and direct submission, then proceeds after repair', async (panels, forward) => {
        await open({selected: ['confidence'], alerts: true, creation: panels, multiple: true})
        const original = select(['process.loadedRecipes', CCDC, 'model'])
        await selectReference()
        expect(button(forward).disabled).toBe(true)
        expect(marked()).toEqual([]) // The draft has not changed the applied recipe's marks.
        expect(document.querySelector('[data-label="widget.recipeInput.label"] [data-feedback="error"]')).not.toBe(null)
        await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true})))
        await act(async () => requestSubmit())
        await settled()
        expect(select(['process.loadedRecipes', CCDC, 'model'])).toBe(original)
        expect(fake.wizardDone).toBe(0)
        expect(document.querySelector('[data-label="widget.recipeInput.label"]')).not.toBe(null)
        await holdInput(MOSAIC_INPUT)
        expect(button(forward).disabled).toBe(false)
        await click(forward)
        expect(select(['process.loadedRecipes', CCDC, 'model.reference'])).toEqual({type: 'RECIPE_REF', id: 'reference-ccdc'})
        expect(document.querySelector('[data-label="widget.recipeInput.label"]')).toBe(null)
        expect(fake.wizardDone).toBe(forward === 'button.done' ? 1 : 0)
    })

    it('releases Next after selecting a usable replacement for the broken draft', async () => {
        await open({selected: ['confidence'], alerts: true, creation: ['reference', 'date'], multiple: true})
        await selectReference()
        expect(button('button.next').disabled).toBe(true)
        await selectReference('healthy-ccdc')
        expect(button('button.next').disabled).toBe(false)
        await click('button.next')
        expect(select(['process.loadedRecipes', CCDC, 'model.reference'])).toEqual({type: 'RECIPE_REF', id: 'healthy-ccdc'})
        expect(document.querySelector('[data-label="widget.recipeInput.label"]')).toBe(null)
    })

    it('rechecks an upstream change at direct submission before the wizard renders it, seeding and advancing nothing', async () => {
        await open({selected: ['confidence'], alerts: true, creation: ['reference', 'date']})
        await selectReference()
        expect(button('button.next').disabled).toBe(false)
        const original = select(['process.loadedRecipes', CCDC, 'model'])
        firstListener = () => {
            firstListener = () => {}
            requestSubmit()
        }
        await act(async () => actionBuilder('BREAK_BEFORE_SUBMISSION')
            .set(['process.loadedRecipes', CLASSIFICATION, 'model.inputImagery.images'], [MOSAIC_INPUT, {...MOSAIC_INPUT, imageId: 'i-2'}])
            .dispatch())
        await settled()
        expect(select(['process.loadedRecipes', CCDC, 'model'])).toBe(original)
        expect(fake.wizardDone).toBe(0)
        expect(button('button.next').disabled).toBe(true)
    })

    it('allows Back from an invalid REF step without applying or seeding it', async () => {
        await open({selected: ['confidence'], alerts: true, creation: ['date', 'reference'], multiple: true})
        await click('button.next')
        const original = select(['process.loadedRecipes', CCDC, 'model'])
        await selectReference()
        expect(button('button.done').disabled).toBe(true)
        expect(button('button.back').disabled).toBe(false)
        await click('button.back')
        expect(select(['process.loadedRecipes', CCDC, 'model'])).toBe(original)
        expect(document.querySelector('[data-label="widget.recipeInput.label"]')).toBe(null)
    })
})

describe('an open Change Alerts Retrieve over a live CCDC', () => {
    it('closes and marks REF when the referenced computation loses its training data, then opens after repair', async () => {
        await open({selected: ['confidence'], alerts: true})
        await openRetrieve()
        expect(panelOpen()).toBe(true)
        await holdTrainingData([])
        expect(panelOpen()).toBe(false)
        expect(retrieveButton().disabled).toBe(true)
        expect(marked()).toEqual(['reference'])
        expect(fake.submitted).toEqual([])
        await holdTrainingData([COLLECTED])
        expect(retrieveButton().disabled).toBe(false)
        expect(marked()).toEqual([])
        await openRetrieve()
        expect(panelOpen()).toBe(true)
    })
})

describe('an open CCDC Retrieve whose Classification loses its points', () => {
    it.each([['one it computes', CLASSIFIED_MEASURE], ['one of the scenes', NATIVE_MEASURE]])('closes over %s, submitting nothing, its action disabled while SRC says why', async (_case, selected) => {
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
        expect(fake.projects).toEqual([])
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

    it.each([['one it computes', CLASSIFIED_MEASURE], ['one of the scenes', NATIVE_MEASURE]])('submits nothing of %s, leaving the destination remembered, where they are removed in the event submitting it', async (_case, selected) => {
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

// A breakpoint band is fitted whatever is selected, so the image output itself needs that Classification's training.
describe('an open CCDC Retrieve fitting a breakpoint band its Classification computes', () => {
    it('closes over a measure of the scenes once that Classification stores no points, and submits it once repaired and opened again', async () => {
        await open({selected: [NATIVE], breakpointBands: [NATIVE, CLASSIFIED]})
        await openRetrieve()

        await holdTrainingData([])
        expect(panelOpen()).toBe(false)
        expect(retrieveButton().disabled).toBe(true)

        await holdTrainingData([COLLECTED])
        await openRetrieve()
        await apply()
        expect(measures()).toEqual([[NATIVE]])
    })
})

describe('an open CCDC Retrieve whose Classification imagery is not yet known', () => {
    it.each([['one it computes', CLASSIFIED_MEASURE], ['one of the scenes', NATIVE_MEASURE]])('holds %s open, keeping it selected, until that imagery is observed, then submits it', async (_case, selected) => {
        await open({selected: [selected]})
        await openRetrieve()
        const observed = new Subject()
        inputBands$.mockReturnValue(observed)

        await holdInput(ASSET_INPUT)
        expect(panelOpen()).toBe(true)
        expect(applyEnabled()).toBe(false)
        await apply()
        expect(fake.submitted).toEqual([])
        expect(panelOpen()).toBe(true)
        expect(selectedMeasures()).toEqual([selected])

        await act(async () => observed.next(INPUT_BANDS))
        await settled()
        await apply()
        expect(measures()).toEqual([[selected]])
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
        expect(document.body.textContent).toContain('process.retrieve.source.unavailable')
        expect(document.body.textContent).toContain('process.retrieve.assets.retry')
    })
})

// Enter in a field submits the form, whatever Apply says (widget/form/panel.jsx).
describe('an open CCDC Retrieve submitted from the keyboard while its Classification imagery is being observed', () => {
    it('stays open, keeping the asset edited unsaved and submitting nothing, then submits it once that imagery is observed', async () => {
        await open({selected: [NATIVE]})
        await openRetrieve()
        const observed = new Subject()
        inputBands$.mockReturnValue(observed)
        await holdInput(ASSET_INPUT)
        await act(async () => fake.assetId.set(OTHER_ASSET_ID))
        await settled()

        await act(async () => requestSubmit())
        await settled()

        expect(panelOpen()).toBe(true)
        expect(savedSettings()).toMatchObject({assetId: ASSET_ID})
        expect(fake.submitted).toEqual([])
        expect(fake.projects).toEqual([])

        await act(async () => observed.next(INPUT_BANDS))
        await settled()
        await act(async () => requestSubmit())
        await settled()
        expect(fake.submitted.map(({params}) => params.image.assetId)).toEqual([OTHER_ASSET_ID])
        expect(savedSettings()).toMatchObject({assetId: OTHER_ASSET_ID})
    })
})

describe('an open CCDC Retrieve over a Classification edited in its own tab', () => {
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
        expect(measures()).toEqual([[CLASSIFIED]])
    })
})

describe('an open CCDC Retrieve its own form leaves incomplete', () => {
    it('stays open with nothing selected, submitting once a measure is', async () => {
        await open({selected: [CLASSIFIED]})
        await openRetrieve()

        await click(REGRESSION)
        expect(panelOpen()).toBe(true)
        expect(applyEnabled()).toBe(false)

        await click(REGRESSION)
        await apply()
        expect(measures()).toEqual([[CLASSIFIED]])
    })

    it('stays open with no asset named, submitting to the one named then', async () => {
        await open({selected: [NATIVE]})
        await openRetrieve()

        await act(async () => fake.assetId.set(''))
        await settled()
        expect(panelOpen()).toBe(true)
        expect(applyEnabled()).toBe(false)

        await act(async () => fake.assetId.set(OTHER_ASSET_ID))
        await settled()
        await apply()
        expect(fake.submitted.map(({params}) => params.image.assetId)).toEqual([OTHER_ASSET_ID])
    })
})

describe('CCDC Retrieve over a Classification that cannot be trained', () => {
    it('is not offered, and submits a measure of the scenes once Sources select no Classification', async () => {
        await open({selected: [NATIVE], trainingData: []})
        expect(retrieveButton().disabled).toBe(true)

        await act(async () => actionBuilder('APPLY_SOURCES')
            .set(['process.loadedRecipes', CCDC, 'model.sources.classification'], null)
            .dispatch())
        await settled()
        await openRetrieve()
        await apply()

        expect(measures()).toEqual([[NATIVE]])
    })
})

// The export is held to its image output alone, which the panel itself watches: nothing more is watched, whatever is
// selected or fitted.
describe('what an open CCDC Retrieve watches', () => {
    it('is nothing beyond its image output, whatever measures are selected or breakpoint bands fitted', async () => {
        await open({selected: [NATIVE]})
        await openRetrieve()
        expect(watchedOperations()).toEqual([])
        expect(watchedOutputs()).toEqual([MARKS_QUESTION, RETRIEVE_QUESTION])

        await click(REGRESSION)
        expect(watchedOperations()).toEqual([])

        await holdBreakpointBands([NATIVE, CLASSIFIED])
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

const CCDC = 'ccdc-1'
const CLASSIFICATION = 'classification-1'
const MOSAIC = 'mosaic-1'
const PROJECT = 'project-1'
const ASSET_ID = 'projects/p/assets/ccdc'
const OTHER_ASSET_ID = 'projects/p/assets/other'
const NATIVE = 'ndvi'
const CLASSIFIED = 'regression'
const REGRESSION = 'process.classification.bands.regression'
const INPUT_BANDS = ['red', 'nir'].map(name => ({name, arrayDimensions: 0}))
const CCDC_BANDS = [
    'tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb',
    ...[NATIVE, 'swir1', CLASSIFIED].flatMap(measure => ['coefs', 'rmse', 'magnitude'].map(suffix => `${measure}_${suffix}`))
]
const LEGEND = {entries: [{id: 'a', value: 1, label: 'Forest', color: '#000000'}, {id: 'b', value: 2, label: 'Other', color: '#ffffff'}]}
const COLLECTED = {dataSetId: 'collected', type: 'COLLECTED', name: 'Collected', referenceData: [{x: 1, y: 1, class: 1}, {x: 2, y: 2, class: 2}]}
const ADDED = {dataSetId: 'added', type: 'COLLECTED', name: 'Added', referenceData: [{x: 3, y: 3, class: 1}]}
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

const selectReference = (name = 'reference-ccdc') => selectInField('widget.recipeInput.label', name)
const selectInField = async (label, name) => {
    if (!document.querySelector(`[data-label="${label}"]`) && button('button.more')) await click('button.more')
    const input = document.querySelector(`[data-label="${label}"] input`)
    expect(input).not.toBe(null)
    await act(async () => input.click())
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, name)
        input.dispatchEvent(new Event('input', {bubbles: true}))
        vi.advanceTimersByTime(500)
    })
    await settled()
    const option = [...document.querySelectorAll('[data-hook="option"]')].find(element => element.textContent === name)
    expect(option).toBeDefined()
    await act(async () => option.click())
    await settled()
}
const button = label => buttons().find(button => button.textContent === label)

const buttons = () => [...document.querySelectorAll('button')]

const click = async label => {
    const button = buttons().find(button => button.textContent === label)
    expect(button, `no button labelled ${label}`).toBeDefined()
    await act(async () => button.click())
    await settled()
}

// The toolbar's Retrieve action.
const retrieveButton = () => document.querySelector('button[data-icon=cloud-download-alt]')

// Opened as its action opens it, past the loading view held for a minimum.
const openRetrieve = async () => {
    expect(retrieveButton().disabled, 'Retrieve is not offered').toBe(false)
    await act(async () => retrieveButton().click())
    await settled()
    await act(async () => vi.advanceTimersByTime(MINIMUM_LOADING_MS + 50))
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

const measures = () => fake.submitted.map(({params}) => params.image.bands)

// The retrieval settings the recipe keeps: those last submitted.
const savedSettings = () => select(['process.loadedRecipes', CCDC, 'ui.retrieve'])

// The sections the toolbar marks as needing attention.
const marked = () => Object.keys(JSON.parse(document.querySelector('output[aria-label=marks]').dataset.marks))

// The measures the form holds selected.
const selectedMeasures = () => [].concat(select(['process.loadedRecipes', CCDC, 'ui.retrieve.bands']) ?? [])

// The Classification's training data as the session holds it: saved, where it is open, as any edit of it is.
const holdTrainingData = async dataSets => {
    await act(async () => actionBuilder('EDIT_TRAINING_DATA')
        .set(['process.loadedRecipes', CLASSIFICATION, 'model.trainingData.dataSets'], dataSets)
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

// The output questions watched about the CCDC: the panel's, and the toolbar marks', which ask for an explanation.
const watchedOutputs = () => watched.filter(({recipeId, product}) => recipeId === CCDC && product)
const RETRIEVE_QUESTION = {recipeId: CCDC, product: {name: 'IMAGE_OUTPUT'}}
const MARKS_QUESTION = {recipeId: CCDC, product: {name: 'IMAGE_OUTPUT'}, explain: true}

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
// Retrieve is offered beside the toolbar's marks within its set-up wizard, done, as the toolbar offers it, and is closed.
const open = async ({selected, breakpointBands = [NATIVE], input = MOSAIC_INPUT, trainingData = [COLLECTED], classificationOpen = false, alerts = false, creation = null, multiple = false, sourcesWizard = false}) => {
    const records = [ccdcRecipe({selected, breakpointBands}), classificationRecipe({input, trainingData}), mosaicRecipe()]
    fake.creation = Boolean(creation)
    if (multiple) records[1].model.inputImagery.images.push({...input, imageId: 'i-2'})
    if (alerts) {
        const reference = {...records[0], id: 'reference-ccdc'}
        records[0] = {...records[0], type: 'CHANGE_ALERTS', model: {
            reference: creation ? {} : {type: 'RECIPE_REF', id: reference.id},
            sources: {dataSetType: 'OPTICAL', dataSets: {LANDSAT: ['LANDSAT_8']}, band: 'ndvi'}, options: {corrections: ['SR']},
            date: {monitoringEnd: '2024-01-01', monitoringDuration: 1, monitoringDurationUnit: 'months', calibrationDuration: 2, calibrationDurationUnit: 'months'}
        }}
        records[0].ui.initialized = !creation
        records.push(reference)
        if (creation) {
            const {classification: _classification, ...sources} = reference.model.sources
            records.push({...reference, id: 'healthy-ccdc', model: {...reference.model, sources}})
        }
    }
    if (creation) records.forEach(record => record.projectId = PROJECT)
    if (sourcesWizard) {
        records[0].ui.initialized = false
        records[0].model.sources = {...records[0].model.sources, classification: null}
        records.push({...classificationRecipe({input, trainingData: [COLLECTED]}), id: 'healthy-classification', projectId: PROJECT})
    }
    const RetrievePanel = alerts ? AlertsRetrieve : Retrieve
    fake.stored = Object.fromEntries(records.map(record => [record.id, record]))
    const initialState = {
        dimensions: {width: 1024, height: 768},
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: Object.fromEntries(records.map(record => [record.id, record])),
            tabs: [{id: CCDC}, ...(classificationOpen ? [{id: CLASSIFICATION}] : [])],
            saveStates: classificationOpen ? {[CLASSIFICATION]: {status: 'SAVED', revision: 1, model: records[1].model}} : {},
            recipes: records.map(({id, type, revision, projectId}) => ({id, type, revision, projectId, name: id})),
            recipeListing: {checkedAt: Date.now()},
            projects: [{id: PROJECT, name: 'Project', defaultAssetFolder: 'projects/p/assets/earlier'}]
        }
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    store.subscribe(() => firstListener())
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
                                <Recipe id={CCDC}>
                                    <PanelWizard panels={creation || ['aoi', 'dates', 'sources']} initialized={!creation} onDone={() => fake.wizardDone++}>
                                        <SectionMarks/>
                                        {sourcesWizard ? <><CcdcSources/><CcdcDates/></>
                                            : creation ? <><Reference/><AlertsDate/></> : <><RetrieveButton/><RetrievePanel/></>}
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

// The panel opens on a loading view held for a minimum, which a scenario about the form waits out.
const MINIMUM_LOADING_MS = 500
