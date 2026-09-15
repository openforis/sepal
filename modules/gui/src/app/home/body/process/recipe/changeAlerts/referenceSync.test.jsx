import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {selectFrom} from '~/stateUtils'
import {initStore} from '~/store'

// Which reference Change Alerts executes, and which producer its monitoring configuration is initialized
// from. The two are not the same thing: a Masking recipe over CCDC is what must run, while the CCDC
// underneath it is what its collection and corrections are seeded from.
//
// Synchronization is driven the way the application drives it - the component connected to a real store,
// dispatching through the real action builder - so what is observed is the recipe the store ends up
// holding, not a script of lifecycle calls.

const assetMetadata$ = vi.fn()
vi.mock('~/apiRegistry', () => ({default: {gee: {assetMetadata$: (...args) => assetMetadata$(...args)}}}))
vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
vi.mock('~/widget/form/assetCombo', () => ({FormAssetCombo: () => null}))
vi.mock('~/sources', () => ({getAvailableBands: ({dataSets}) => dataSets.map(dataSet => dataSet.toLowerCase())}))
vi.mock('../ccdc/ccdcRecipe', () => ({getAllVisualizations: recipe => recipe.model.templates || []}))
vi.mock('~/app/home/body/process/recipeTypeRegistry', () => ({
    getRecipeType: type => type === 'MASKING'
        ? {sourceRecipe: recipe => recipe.model.imageToMask}
        : type === 'ASSET_MOSAIC'
            ? {sourceRecipe: recipe => ({type: 'ASSET', id: recipe.model.assetDetails.assetId})}
            : {}
}))

const {ReferenceSync} = await import('./referenceSync')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ALERTS = 'alerts-1'
const MASKING = 'masking-1'
const CCDC = 'ccdc-1'
const SEGMENTS_ASSET = 'users/x/segments'
const WRAPPED_ASSET = 'masking-over-asset'
const ASSET_MOSAIC = 'asset-mosaic-1'

let root, container, store

beforeEach(() => {
    assetMetadata$.mockReset()
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
    vi.restoreAllMocks()
})

describe('selecting a recipe as the reference', () => {
    it('executes the recipe that was selected, not the producer found underneath it', () => {
        sync({selection: {type: 'RECIPE_REF', id: MASKING}})

        expect(reference().id).toBe(MASKING)
        expect(reference().type).toBe('RECIPE_REF')
    })

    it('keeps a directly selected CCDC recipe as the reference', () => {
        sync({selection: {type: 'RECIPE_REF', id: CCDC}})

        expect(reference().id).toBe(CCDC)
        expect(reference().type).toBe('RECIPE_REF')
    })

    // The description of what the source produces is the source's, read when it is needed. Nothing writes
    // a copy of it beside the reference any more.
    it('writes no description of the source beside the reference', () => {
        sync({selection: {type: 'RECIPE_REF', id: MASKING}})

        expect(reference()).toEqual({type: 'RECIPE_REF', id: MASKING})
    })

    // The producer supplies the initial datasets; the band, dataset type and cloud threshold are the user's.
    it('does not reset the monitoring configuration the user has chosen', () => {
        sync({
            selection: {type: 'RECIPE_REF', id: MASKING},
            sources: {band: 'nir', dataSetType: 'OPTICAL', cloudPercentageThreshold: 42}
        })

        expect(sources()).toMatchObject({
            band: 'nir',
            cloudPercentageThreshold: 42,
            dataSets: {LANDSAT: ['RED', 'NIR']}
        })
    })
})

describe('the producer of a selected recipe', () => {
    // The monitoring configuration follows the producer while it changes under the same id; the segment
    // description it is consistent with is read from the same record.
    it('supplies refreshed datasets and corrections when it changes', async () => {
        sync({selection: {type: 'RECIPE_REF', id: MASKING}})

        await update(CCDC, {
            sources: {dataSets: {SENTINEL_1: ['SENTINEL_1']}},
            options: {corrections: []}
        })

        expect(sources().dataSets).toEqual({SENTINEL_1: ['SENTINEL_1']})
        expect(alertsRecipe().model.options).toEqual({corrections: []})
    })

    // A wrapper leading to a segments asset has no recipe model to seed from; the asset carries what it
    // was exported with.
    it('is the asset a wrapper leads to, whose exported configuration seeds monitoring', async () => {
        assetMetadata$.mockReturnValue(of(assetMetadata({
            dateFormat: 2,
            recipe_sources: JSON.stringify({dataSets: {SENTINEL_1: ['SENTINEL_1']}}),
            recipe_options: JSON.stringify({corrections: ['SPECKLE']})
        })))

        sync({selection: {type: 'RECIPE_REF', id: WRAPPED_ASSET}})
        await settled()

        expect(sources().dataSets).toEqual({SENTINEL_1: ['SENTINEL_1']})
        expect(alertsRecipe().model.options).toEqual({corrections: ['SPECKLE']})
        expect(reference()).toEqual({type: 'RECIPE_REF', id: WRAPPED_ASSET})
    })
})

describe('selecting a segments asset as the reference', () => {
    it('reads its date representation from the asset', () => {
        assetMetadata$.mockReturnValue(of(assetMetadata({dateFormat: 2})))

        sync({selection: {type: 'ASSET', id: SEGMENTS_ASSET}})

        expect(reference().dateFormat).toBe(2)
    })

    it('reads a zero representation as the asset stating one', () => {
        assetMetadata$.mockReturnValue(of(assetMetadata({dateFormat: 0})))

        sync({selection: {type: 'ASSET', id: SEGMENTS_ASSET, dateFormat: 1}})

        expect(reference().dateFormat).toBe(0)
    })

    // A correction the user applied to the asset already selected is their answer; asking the asset again
    // would put its own property straight back.
    it('keeps a correction applied to the asset already selected', async () => {
        assetMetadata$.mockReturnValue(of(assetMetadata({dateFormat: 2})))
        sync({selection: {type: 'ASSET', id: SEGMENTS_ASSET}})
        await settled()
        expect(reference().dateFormat).toBe(2)

        await update(ALERTS, {reference: {type: 'ASSET', id: SEGMENTS_ASSET, dateFormat: 0}})

        expect(reference().dateFormat).toBe(0)
    })

    it('keeps what was configured beside the reference when the asset states none', () => {
        assetMetadata$.mockReturnValue(of(assetMetadata({})))

        sync({selection: {type: 'ASSET', id: SEGMENTS_ASSET, dateFormat: 1}})

        expect(reference().dateFormat).toBe(1)
    })
})

const settled = () => act(async () => {})

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

const sources = () => alertsRecipe().model.sources

const sync = ({selection, sources = {}}) => {
    const initialState = {
        process: {
            loadedRecipes: {
                [ALERTS]: {
                    id: ALERTS,
                    type: 'CHANGE_ALERTS',
                    model: {reference: selection, sources, options: {}}
                },
                [MASKING]: {
                    id: MASKING,
                    type: 'MASKING',
                    model: {imageToMask: {type: 'RECIPE_REF', id: CCDC}}
                },
                [CCDC]: ccdcRecipe(),
                [WRAPPED_ASSET]: {
                    id: WRAPPED_ASSET,
                    type: 'MASKING',
                    model: {imageToMask: {type: 'RECIPE_REF', id: ASSET_MOSAIC}}
                },
                [ASSET_MOSAIC]: {
                    id: ASSET_MOSAIC,
                    type: 'ASSET_MOSAIC',
                    model: {assetDetails: {assetId: SEGMENTS_ASSET}}
                }
            },
            recipes: [],
            projects: [],
            // No open tab: autosave is triggered from there and is not what synchronization exercises.
            tabs: []
        }
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root.render(
        <Provider store={store}>
            <Recipe id={ALERTS}>
                <ReferenceSync/>
            </Recipe>
        </Provider>
    ))
}

const ccdcRecipe = () => ({
    id: CCDC,
    type: 'CCDC',
    model: {
        sources: {dataSets: {LANDSAT: ['RED', 'NIR']}},
        options: {corrections: ['SR']},
        ccdcOptions: {dateFormat: 1},
        dates: {startDate: '2015-01-01', endDate: '2021-01-01'},
        templates: [{id: 'v-red'}]
    }
})

const assetMetadata = properties => ({
    bandNames: ['red_coefs', 'red_rmse', 'tStart', 'tEnd'],
    properties: {startDate: '2015-01-01', endDate: '2021-01-01', ...properties}
})
