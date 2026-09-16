import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {of, Subject, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {selectFrom} from '~/stateUtils'
import {initStore} from '~/store'

// Where BAYTS Alerts' radar processing options come from, and when they are written again.
//
// The selection is what executes; the producer underneath it is only what the options are seeded from. A
// Masking over a BAYTS historical recipe runs Masking and takes the historical recipe's options.
//
// Composed: the real evidence lifecycle runs the real observation over the real shared declarations, and
// applies BAYTS Alerts' own policy to what it accepts. Only the asset metadata read is substituted.

const assetMetadata$ = vi.fn()
const loadRecipe$ = vi.fn()
vi.mock('~/apiRegistry', () => ({default: {
    gee: {assetMetadata$: (...args) => assetMetadata$(...args)},
    recipe: {load$: (...args) => loadRecipe$(...args)}
}}))
vi.mock('~/translate', () => ({msg: key => key}))
const notifyError = vi.fn()
vi.mock('~/widget/notifications', () => ({Notifications: {error: (...args) => notifyError(...args)}}))
vi.mock('~/widget/form/assetCombo', () => ({FormAssetCombo: () => null}))
vi.mock('~/app/home/body/process/recipeTypeRegistry', () => ({getRecipeType: () => ({})}))

const {SourceEvidenceSync} = await import('../sourceEvidenceSync')
const {baytsAlertsObservation} = await import('./referenceObservation')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ALERTS = 'alerts-1'
const HISTORICAL = 'historical-1'
const OTHER_HISTORICAL = 'historical-2'
const MASKED = 'masked-historical'
const ASSET_MOSAIC = 'asset-mosaic-1'
const WRAPPED_ASSET = 'masked-asset'
const STATS_ASSET = 'users/x/historical'

let root, container, store

beforeEach(() => {
    assetMetadata$.mockReset()
    notifyError.mockReset()
    loadRecipe$.mockReset().mockReturnValue(throwError(() => new Error('Recipe not found')))
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
    vi.restoreAllMocks()
})

describe('the producer a selection stands for', () => {
    it('is a directly selected historical recipe, whose options seed the monitoring run', async () => {
        sync({selection: recipeSelection(HISTORICAL)})
        await settled()

        expect(options()).toMatchObject({orbits: ['ASCENDING'], minObservations: 20})
    })

    it('is the historical recipe under a preserving wrapper, which stays what executes', async () => {
        sync({selection: recipeSelection(MASKED)})
        await settled()

        expect(options()).toMatchObject({orbits: ['ASCENDING'], minObservations: 20})
        expect(reference()).toEqual({type: 'RECIPE_REF', id: MASKED})
    })

    it('is the asset a wrapper leads to, whose exported options seed the monitoring run', async () => {
        assetStates({recipe_options: JSON.stringify({orbits: ['DESCENDING'], minObservations: 7})})

        sync({selection: recipeSelection(WRAPPED_ASSET)})
        await settled()

        expect(options()).toMatchObject({orbits: ['DESCENDING'], minObservations: 7})
        expect(reference()).toEqual({type: 'RECIPE_REF', id: WRAPPED_ASSET})
    })
})

describe('a second source selected after the first was resolved', () => {
    it('seeds the options of the source now selected', async () => {
        sync({selection: recipeSelection(HISTORICAL)})
        await settled()
        expect(options().orbits).toEqual(['ASCENDING'])

        await update(ALERTS, {reference: recipeSelection(OTHER_HISTORICAL)})

        expect(options()).toMatchObject({orbits: ['DESCENDING'], minObservations: 3})
    })
})

describe('the producer of the selection already made', () => {
    it('supplies refreshed options when its own change', async () => {
        sync({selection: recipeSelection(MASKED)})
        await settled()

        await update(HISTORICAL, {options: {orbits: ['ASCENDING', 'DESCENDING'], minObservations: 12}})

        expect(options()).toMatchObject({orbits: ['ASCENDING', 'DESCENDING'], minObservations: 12})
    })

    // The producer answers with the options it answered with before, so what the user has since chosen in
    // the preprocess panel is left alone.
    it('leaves options the user edited alone when it changes for another reason', async () => {
        sync({selection: recipeSelection(MASKED)})
        await settled()

        await update(ALERTS, {options: {...options(), minObservations: 42}})
        await update(HISTORICAL, {dates: {fromDate: '2019-01-01', toDate: '2020-01-01'}})

        expect(options().minObservations).toBe(42)
    })
})

describe('a source that cannot be read', () => {
    // The options a monitoring run would use go on reading exactly as they did, so a read that seeded
    // nothing is indistinguishable from one that had nothing to seed unless it is said out loud.
    it('leaves the options as the user left them, and says the read failed', async () => {
        assetMetadata$.mockReturnValue(throwError(() => new Error('asset unavailable')))

        sync({selection: recipeSelection(WRAPPED_ASSET), options: {minObservations: 42}})
        await settled()

        expect(options()).toEqual({minObservations: 42})
        expect(reportedFailures()).toEqual(['process.baytsAlerts.reference.recipe.loadError'])
    })

    // The reference recipe itself is gone, so the failure is the dependency read rather than the
    // observation - which never runs at all.
    it('says so when the selected recipe cannot be loaded', async () => {
        sync({selection: recipeSelection('deleted-1'), options: {minObservations: 42}})
        await settled()

        expect(options()).toEqual({minObservations: 42})
        expect(reportedFailures()).toEqual(['process.baytsAlerts.reference.recipe.loadError'])
    })

    it('says which asset failed when an asset was what was selected', async () => {
        assetMetadata$.mockReturnValue(throwError(() => new Error('asset unavailable')))

        sync({selection: {type: 'ASSET', id: STATS_ASSET}, options: {minObservations: 42}})
        await settled()

        expect(reportedFailures()).toEqual(['process.baytsAlerts.reference.asset.loadError'])
    })

    // A read that failed says which source was asked, not what was found: the first answer about this
    // selection is still its first.
    it('still seeds the options once it can be read', async () => {
        assetMetadata$.mockReturnValue(throwError(() => new Error('asset unavailable')))
        sync({selection: recipeSelection(WRAPPED_ASSET)})
        await settled()

        assetStates({recipe_options: JSON.stringify({orbits: ['DESCENDING'], minObservations: 7})})
        await reExport()

        expect(options()).toMatchObject({orbits: ['DESCENDING'], minObservations: 7})
    })

    it('does not restore options the user edited when it comes back unchanged', async () => {
        assetStates({recipe_options: JSON.stringify({minObservations: 7})})
        sync({selection: recipeSelection(WRAPPED_ASSET)})
        await settled()
        expect(options().minObservations).toBe(7)
        await update(ALERTS, {options: {...options(), minObservations: 42}})

        assetMetadata$.mockReturnValue(throwError(() => new Error('asset unavailable')))
        await reExport()
        assetStates({recipe_options: JSON.stringify({minObservations: 7})})
        await reExport()

        expect(options().minObservations).toBe(42)
    })
})

describe('a response for a selection that has been replaced', () => {
    it('does not configure the recipe that moved on', async () => {
        const held = new Subject()
        assetMetadata$.mockReturnValue(held)
        sync({selection: recipeSelection(WRAPPED_ASSET)})
        await settled()

        await update(ALERTS, {reference: recipeSelection(HISTORICAL)})
        await act(async () => {
            held.next({bandNames: [], properties: {recipe_options: JSON.stringify({minObservations: 99})}})
            held.complete()
        })

        expect(options()).toMatchObject({orbits: ['ASCENDING'], minObservations: 20})
    })

    it('announces no failure about the selection the recipe has moved off', async () => {
        const held = new Subject()
        assetMetadata$.mockReturnValue(held)
        sync({selection: recipeSelection(WRAPPED_ASSET)})
        await settled()

        await update(ALERTS, {reference: recipeSelection(HISTORICAL)})
        await act(async () => held.error(new Error('asset unavailable')))

        expect(reportedFailures()).toEqual([])
    })
})

const settled = () => act(async () => {})

const reportedFailures = () => notifyError.mock.calls.map(([{message}]) => message)

const recipeSelection = id => ({type: 'RECIPE_REF', id})

const assetStates = properties =>
    assetMetadata$.mockReturnValue(of({bandNames: ['VV_stdDev'], properties}))

// The asset store's version is what tells the evidence lifecycle an asset has moved on.
let assetVersion = 0
const reExport = () => act(async () => store.dispatch({
    type: 'ASSET_RE_EXPORTED',
    reduce: state => ({
        ...state,
        assets: {user: [{id: STATS_ASSET, updateTime: `v${++assetVersion}`}], other: []}
    })
}))

const update = (id, model) => act(async () => store.dispatch({
    type: 'UPDATE_RECORD',
    reduce: state => ({
        ...state,
        process: {
            ...state.process,
            loadedRecipes: {
                ...state.process.loadedRecipes,
                [id]: {
                    ...state.process.loadedRecipes[id],
                    model: {...state.process.loadedRecipes[id].model, ...model}
                }
            }
        }
    })
}))

const alertsRecipe = () => selectFrom(store.getState(), ['process.loadedRecipes', ALERTS])

const reference = () => alertsRecipe().model.reference

const options = () => alertsRecipe().model.options

const sync = ({selection, options = {}}) => {
    const initialState = {
        process: {
            loadedRecipes: {
                [ALERTS]: {
                    id: ALERTS,
                    type: 'BAYTS_ALERTS',
                    model: {reference: selection, options, baytsAlertsOptions: {}}
                },
                [HISTORICAL]: historical(HISTORICAL, {orbits: ['ASCENDING'], minObservations: 20}),
                [OTHER_HISTORICAL]: historical(OTHER_HISTORICAL, {orbits: ['DESCENDING'], minObservations: 3}),
                [MASKED]: {
                    id: MASKED,
                    type: 'MASKING',
                    model: {imageToMask: recipeSelection(HISTORICAL)}
                },
                [WRAPPED_ASSET]: {
                    id: WRAPPED_ASSET,
                    type: 'MASKING',
                    model: {imageToMask: recipeSelection(ASSET_MOSAIC)}
                },
                [ASSET_MOSAIC]: {
                    id: ASSET_MOSAIC,
                    type: 'ASSET_MOSAIC',
                    model: {assetDetails: {assetId: STATS_ASSET}}
                }
            },
            recipes: [],
            projects: [],
            // No open tab: autosave is triggered from there and is not what synchronization exercises.
            tabs: []
        },
        assets: {user: [{id: STATS_ASSET, updateTime: 'v0'}], other: []}
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root.render(
        <Provider store={store}>
            <Recipe id={ALERTS}>
                <SourceEvidenceSync observation={baytsAlertsObservation}/>
            </Recipe>
        </Provider>
    ))
}

const historical = (id, options) => ({
    id,
    type: 'BAYTS_HISTORICAL',
    model: {
        options,
        dates: {fromDate: '2018-01-01', toDate: '2019-01-01'}
    }
})
