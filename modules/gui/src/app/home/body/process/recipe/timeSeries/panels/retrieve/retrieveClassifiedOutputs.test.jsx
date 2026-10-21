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

// The indicators Time Series Retrieve offers of the Classification its Sources select: as the session holds it, otherwise as
// the source runtime read it for the image output's readiness - over the recipe's own AOI - while that answer is current,
// not as Sources copied it when it was selected. The download runs from storage's copy, so what a draft offers is held
// until storage agrees. Until then what that copy offers of it is not
// established: a selection naming such an output is kept and held, never discarded, and once the record says it is not
// provided it is let go, to be replaced by the user. The registrations, runtime, form, panel and submission are real;
// storage, Earth Engine, task submission and the workspace destination's check are the substitutes.

const fake = vi.hoisted(() => ({stored: {}, listing: [], loads: [], heldLoads: null, submitted: []}))
vi.mock('~/apiRegistry', () => ({default: {
    gee: {assetVersions$: ({ids}) => of({assets: ids.map(id => ({id, type: 'IMAGE', version: 'v1'}))})},
    recipe: {
        load$: id => {
            fake.loads.push(id)
            return fake.heldLoads
                ? new Observable(subscriber => {
                    fake.heldLoads.push(() => {
                        subscriber.next(fake.stored[id])
                        subscriber.complete()
                    })
                })
                : of(fake.stored[id])
        },
        loadAll$: () => of(fake.listing)
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
const {Retrieve} = await import('./retrieve')

addRecipeType(timeSeries())

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, store

beforeEach(() => {
    fake.stored = {[CLASSIFICATION]: classificationOf(SVM)}
    fake.listing = listingAt(1)
    fake.loads = []
    fake.heldLoads = null
    fake.submitted = []
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    document.body.innerHTML = ''
})

describe('Time Series Retrieve over a Classification Sources copied while it regressed', () => {
    it('does not offer the regression the stored SVM does not provide, letting go of it to be replaced', async () => {
        await open({selected: 'regression'})

        expect(offers(REGRESSION)).toBe(false)
        expect(offers(PROBABILITY)).toBe(true)
        await apply()
        expect(fake.submitted).toEqual([])

        await click(NATIVE)
        await apply()
        expect(indicators()).toEqual([[NATIVE]])
    })

    it('holds the regression selected while the Classification is read, submitting nothing and saying nothing wrong', async () => {
        fake.heldLoads = []
        await open({selected: 'regression'})

        expect(offers(REGRESSION)).toBe(true)
        expect(applyEnabled()).toBe(false)
        expect(shown()).not.toContain('process.retrieve.form.bands.atLeastOne')
        await apply()
        expect(fake.submitted).toEqual([])
    })

    it('submits nothing for the regression selected while the Classification is read, however the form is submitted', async () => {
        fake.heldLoads = []
        await open({selected: 'regression'})

        await submitForm()

        expect(fake.submitted).toEqual([])
    })

    // A one-class SVM, as copied, provides no class probability; the C_SVC storage holds does.
    it('keeps an output the stored Classification provides selected while it is read, though the copy lacks it, and submits it once it is', async () => {
        fake.heldLoads = []
        await open({selected: 'probability_1', copied: {type: 'SVM', svmType: 'ONE_CLASS'}})
        expect(applyEnabled()).toBe(false)

        await answerHeldLoads()
        await apply()

        expect(indicators()).toEqual([['probability_1']])
    })

    it('holds a native and classified selection together until the Classification is read, then submits both indicators', async () => {
        fake.heldLoads = []
        await open({selected: [NATIVE, 'probability_1']})

        expect(applyEnabled()).toBe(false)
        await submitForm()
        expect(fake.submitted).toEqual([])

        await answerHeldLoads()
        await apply()

        expect(indicators()).toEqual([[NATIVE, 'probability_1']])
    })

    it('submits a band of the images while the Classification is read, as before', async () => {
        fake.heldLoads = []
        await open({selected: NATIVE})

        await apply()

        expect(indicators()).toEqual([[NATIVE]])
    })

    it('offers the Classification as the session holds it once it does, over what storage and the copy say', async () => {
        fake.stored = {[CLASSIFICATION]: classificationOf(RANDOM_FOREST)}
        await open({selected: NATIVE})
        expect(offers(REGRESSION)).toBe(true)

        await holdInSession(classificationOf(SVM))

        expect(offers(REGRESSION)).toBe(false)
    })

    // A Random Forest being saved over the SVM storage holds: the download runs from storage's copy.
    it('holds the regression a Classification being saved offers until storage agrees, then submits it', async () => {
        await open({selected: 'regression', saving: classificationOf(RANDOM_FOREST, 2)})
        expect(offers(REGRESSION)).toBe(true)

        await apply()
        await submitForm()
        expect(fake.submitted).toEqual([])

        await saved(CLASSIFICATION)
        await apply()
        expect(indicators()).toEqual([['regression']])
    })

    it('submits a band of the images while a Classification is being saved, as before', async () => {
        await open({selected: NATIVE, saving: classificationOf(RANDOM_FOREST, 2)})

        await apply()

        expect(indicators()).toEqual([[NATIVE]])
    })

    it('offers it as storage holds it again once a newer revision is listed, reading it again', async () => {
        await open({selected: NATIVE})
        expect(offers(REGRESSION)).toBe(false)
        const read = fake.loads.length

        fake.stored = {[CLASSIFICATION]: classificationOf(RANDOM_FOREST, 2)}
        await listRevision(2)

        expect(fake.loads.length).toBeGreaterThan(read)
        expect(offers(REGRESSION)).toBe(true)
    })
})

const ID = 'time-series-1'
const CLASSIFICATION = 'classification-1'
const SVM = {type: 'SVM', svmType: 'C_SVC'}
const RANDOM_FOREST = {type: 'RANDOM_FOREST'}
const LEGEND = {entries: [{value: 1, label: 'Forest'}, {value: 2, label: 'Other'}]}
const NATIVE = 'ndvi'
const REGRESSION = 'process.classification.bands.regression'
const PROBABILITY = 'process.classification.bands.probability'

const classificationOf = (classifier, revision = 1) => ({
    id: CLASSIFICATION,
    type: 'CLASSIFICATION',
    revision,
    model: {
        inputImagery: {images: [{imageId: 'i-1', type: 'ASSET', id: 'users/x/input', bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included: ['red', 'nir']}]}]},
        legend: LEGEND,
        classifier
    }
})

const listingAt = revision => [
    {id: ID, type: 'TIME_SERIES', revision: 1},
    {id: CLASSIFICATION, type: 'CLASSIFICATION', revision}
]

// Sources copied the Classification while it was `copied`; Retrieve was last asked for `selected`.
const recipeOf = (selected, copied) => ({
    id: ID,
    type: 'TIME_SERIES',
    title: 'Series',
    revision: 1,
    model: {
        aoi: {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1]]},
        dates: {startDate: '2020-01-01', endDate: '2021-01-01'},
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, classification: CLASSIFICATION},
        options: {corrections: ['SR']}
    },
    ui: {
        initialized: true,
        classification: {classificationLegend: LEGEND, classifierType: copied.type, classifier: copied},
        retrieve: {bands: selected, scale: 30, tileSize: 2, shardSize: 256, fileDimensionsMultiple: 2, destination: 'SEPAL', filenamePrefix: 'series'}
    }
})

const buttons = () => [...document.querySelectorAll('button')]

const offers = label => buttons().some(button => button.textContent === label)

const shown = () => document.body.textContent

const click = label => act(async () => {
    const button = buttons().find(button => button.textContent === label)
    expect(button, `no button labelled ${label}`).toBeDefined()
    button.click()
})

const applyButton = () => buttons().find(button => button.textContent === 'process.retrieve.apply')

const applyEnabled = () => !applyButton().disabled

const apply = async () => {
    await act(async () => applyButton().click())
    await settled()
}

const submitForm = async () => {
    const form = document.querySelector('form')
    await act(async () => form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', {cancelable: true})))
    await settled()
}

const indicators = () => fake.submitted.map(({params}) => [].concat(params.image.indicators))

const settled = async () => {
    for (let i = 0; i < 8; i++) {
        await act(async () => {})
    }
}

const answerHeldLoads = async () => {
    const held = fake.heldLoads
    fake.heldLoads = null
    act(() => held.forEach(answer => answer()))
    await settled()
}

const holdInSession = async record => {
    await act(async () => actionBuilder('HOLD').set(['process.loadedRecipes', record.id], record).dispatch())
    await settled()
}

// The save storage acknowledges, its revision adopted and listed.
const saved = async id => {
    const record = store.getState().process.loadedRecipes[id]
    fake.stored = {...fake.stored, [id]: record}
    fake.listing = listingAt(record.revision)
    await act(async () => actionBuilder('SAVED')
        .set(['process.saveStates', id], {status: 'SAVED', revision: record.revision, model: record.model})
        .set('process.recipes', fake.listing)
        .dispatch())
    await settled()
}

const listRevision = async revision => {
    fake.listing = listingAt(revision)
    await act(async () => actionBuilder('LISTED').set('process.recipes', fake.listing).dispatch())
    await settled()
}

// `saving`: the Classification as the session holds it, closed while its save is still settling.
const open = async ({selected, copied = RANDOM_FOREST, saving}) => {
    const recipe = recipeOf(selected, copied)
    const initialState = {
        dimensions: {width: 1024, height: 768},
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: {[ID]: recipe, ...(saving && {[saving.id]: saving})},
            tabs: [{id: ID}],
            saveStates: saving ? {[saving.id]: {status: 'SAVING', revision: saving.revision}} : {},
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
    await act(async () => root.render(
        <Provider store={store}>
            <PortalContainer/>
            <PortalContainer id='test-portal'/>
            <PortalContext id='test-portal'>
                <EventShield>
                    <SourceRuntimeProvider>
                        <Recipe id={ID}>
                            <Retrieve/>
                        </Recipe>
                    </SourceRuntimeProvider>
                </EventShield>
            </PortalContext>
        </Provider>
    ))
    await settled()
}
