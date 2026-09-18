import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {of, Subject, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {selectFrom} from '~/stateUtils'
import {initStore} from '~/store'

// Where the processing BAYTS Alerts monitors with comes from, and that observing it configures nothing.
//
// The selection is what executes; the producer underneath it is only where the processing is read from. A Masking over
// a BAYTS historical recipe runs Masking, and monitors with the historical recipe's processing. The alerts' own
// options - which passes, masks and angles they monitor - are theirs, whatever the reference answers.
//
// Composed: the real evidence lifecycle runs the real observation over the real shared declarations. Only the asset
// metadata read is substituted.

const assetMetadata$ = vi.fn()
const loadRecipe$ = vi.fn()
// The token Earth Engine reports for every asset: the update time the asset store lists for it.
const versions = vi.hoisted(() => ({current: 0}))
vi.mock('~/apiRegistry', async () => {
    const {of} = await import('rxjs')
    return {default: {
        gee: {
            assetMetadata$: (...args) => assetMetadata$(...args),
            assetVersions$: ({ids}) => of({assets: ids.map(id => ({id, type: 'IMAGE', version: `v${versions.current}`}))})
        },
        recipe: {load$: (...args) => loadRecipe$(...args)}
    }}
})
vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/widget/form/assetCombo', () => ({FormAssetCombo: () => null}))
vi.mock('~/app/home/body/process/recipeTypeRegistry', () => ({getRecipeType: () => ({})}))

const {SourceEvidenceSync} = await import('../sourceEvidenceSync')
const {baytsAlertsObservation} = await import('./referenceObservation')
const {settingsOf} = await import('./processingSettings')

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
    loadRecipe$.mockReset().mockReturnValue(throwError(() => new Error('Recipe not found')))
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
    vi.restoreAllMocks()
})

describe('the producer a selection stands for', () => {
    it('is a directly selected historical recipe, whose processing the alerts monitor with, configuring nothing', async () => {
        sync({selection: recipeSelection(HISTORICAL), options: OWN})
        await settled()

        expect(effective('spatialSpeckleFilter')).toEqual({state: 'REFERENCE', value: 'REFINED_LEE'})
        expect(effective('kernelSize')).toEqual({state: 'REFERENCE', value: 5})
        expect(options()).toEqual(OWN)
    })

    it('is the historical recipe under a preserving wrapper, which stays what executes', async () => {
        sync({selection: recipeSelection(MASKED), options: OWN})
        await settled()

        expect(effective('spatialSpeckleFilter')).toEqual({state: 'REFERENCE', value: 'REFINED_LEE'})
        expect(reference()).toEqual({type: 'RECIPE_REF', id: MASKED})
        expect(options()).toEqual(OWN)
    })

    it('is the asset a wrapper leads to, whose exported options say what they state', async () => {
        assetStates({recipe_options: JSON.stringify({geometricCorrection: 'TERRAIN', orbits: ['DESCENDING']})})

        sync({selection: recipeSelection(WRAPPED_ASSET), options: OWN})
        await settled()

        expect(effective('geometricCorrection')).toEqual({state: 'RECORDED', value: 'TERRAIN'})
        expect(effective('spatialSpeckleFilter')).toEqual({state: 'NOT_RECORDED', value: OWN.spatialSpeckleFilter})
        expect(options()).toEqual(OWN)
    })
})

describe('a saved recipe opened in a new session', () => {
    it('keeps its own passes, masks and angles, and its saved copies, whatever its reference was built with', async () => {
        sync({selection: recipeSelection(HISTORICAL), options: OWN})
        await settled()

        expect(options()).toEqual(OWN)
        expect(effective('spatialSpeckleFilter').value).toBe('REFINED_LEE')
    })
})

describe('a second source selected after the first was resolved', () => {
    it('is monitored with its own processing, the alerts\' choices kept', async () => {
        sync({selection: recipeSelection(HISTORICAL), options: OWN})
        await settled()

        await update(ALERTS, {reference: recipeSelection(OTHER_HISTORICAL)})

        expect(effective('geometricCorrection')).toEqual({state: 'REFERENCE', value: 'TERRAIN'})
        expect(effective('spatialSpeckleFilter')).toEqual({state: 'REFERENCE', value: 'NONE'})
        expect(options()).toEqual(OWN)
    })
})

describe('the producer of the selection already made', () => {
    it('changing its processing, changes what the alerts monitor with and nothing they saved', async () => {
        sync({selection: recipeSelection(MASKED), options: OWN})
        await settled()

        await update(HISTORICAL, {options: {...HISTORICAL_OPTIONS, spatialSpeckleFilter: 'LEE', mask: ['SIDES'], minAngle: 35}})

        expect(effective('spatialSpeckleFilter')).toEqual({state: 'REFERENCE', value: 'LEE'})
        expect(options()).toEqual(OWN)
    })
})

// That it cannot be read is said in REF, as its section's status (sourceRequirement.test.jsx).
describe('a source that cannot be read', () => {
    it('leaves the processing unknown, with no fallback, and the options as the user left them', async () => {
        assetMetadata$.mockReturnValue(throwError(() => new Error('asset unavailable')))

        sync({selection: recipeSelection(WRAPPED_ASSET), options: OWN})
        await settled()

        expect(effective('geometricCorrection')).toEqual({state: 'UNAVAILABLE'})
        expect(settingsOf(alertsRecipe()).model).toBe(null)
        expect(options()).toEqual(OWN)
    })

    it('is read once it can be, configuring nothing then either', async () => {
        assetMetadata$.mockReturnValue(throwError(() => new Error('asset unavailable')))
        sync({selection: recipeSelection(WRAPPED_ASSET), options: OWN})
        await settled()

        assetStates({recipe_type: 'BAYTS_HISTORICAL', recipe_options: JSON.stringify({orbits: ['DESCENDING'], minAngle: 40})})
        await reExport()

        expect(effective('spatialSpeckleFilter')).toEqual({state: 'RECORDED', value: 'NONE'})
        expect(options()).toEqual(OWN)
    })
})

describe('a response for a selection that has been replaced', () => {
    it('says nothing of the selection now made', async () => {
        const held = new Subject()
        assetMetadata$.mockReturnValue(held)
        sync({selection: recipeSelection(WRAPPED_ASSET), options: OWN})
        await settled()

        await update(ALERTS, {reference: recipeSelection(HISTORICAL)})
        await act(async () => {
            held.next({bandNames: [], properties: {recipe_type: 'BAYTS_HISTORICAL', recipe_options: JSON.stringify({spatialSpeckleFilter: 'SNIC'})}})
            held.complete()
        })

        expect(effective('spatialSpeckleFilter')).toEqual({state: 'REFERENCE', value: 'REFINED_LEE'})
        expect(options()).toEqual(OWN)
    })
})

const settled = () => act(async () => {})

const recipeSelection = id => ({type: 'RECIPE_REF', id})

const assetStates = properties =>
    assetMetadata$.mockReturnValue(of({bandNames: ['VV_stdDev'], properties}))

// The asset store's version is what tells the evidence lifecycle an asset has moved on.
const reExport = () => act(async () => store.dispatch({
    type: 'ASSET_RE_EXPORTED',
    reduce: state => ({
        ...state,
        assets: {user: [{id: STATS_ASSET, updateTime: `v${++versions.current}`}], other: []}
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

// What the alerts monitor with, for one reference-owned setting, as their editors read it.
const effective = field => settingsOf(alertsRecipe()).fields[field]

// The alerts' own choices, and a saved copy of a setting the reference owns.
const OWN = {orbits: ['ASCENDING'], mask: ['FIRST_LAST'], minAngle: 32, maxAngle: 44, spatialSpeckleFilter: 'GAMMA_MAP'}

const HISTORICAL_OPTIONS = {orbits: ['ASCENDING'], spatialSpeckleFilter: 'REFINED_LEE', minObservations: 20}

const sync = ({selection, options = {}}) => {
    const initialState = {
        process: {
            loadedRecipes: {
                [ALERTS]: {
                    id: ALERTS,
                    type: 'BAYTS_ALERTS',
                    model: {reference: selection, options, baytsAlertsOptions: {}}
                },
                [HISTORICAL]: historical(HISTORICAL, HISTORICAL_OPTIONS),
                [OTHER_HISTORICAL]: historical(OTHER_HISTORICAL, {orbits: ['DESCENDING'], geometricCorrection: 'TERRAIN'}),
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
            folders: [],
            // No open tab: autosave is triggered from there and is not what synchronization exercises.
            tabs: [{id: ALERTS}]
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
            <SourceRuntimeProvider>
                <Recipe id={ALERTS}>
                    <SourceEvidenceSync observation={baytsAlertsObservation}/>
                </Recipe>
            </SourceRuntimeProvider>
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
