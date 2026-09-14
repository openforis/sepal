import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {selectFrom} from '~/stateUtils'
import {initStore} from '~/store'

// Which reference Change Alerts executes, and which producer it is initialized from. The two are not the
// same thing: a Masking recipe over CCDC is what must run, while the CCDC underneath it is what describes
// the segments.
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
        : {}
}))

const {ReferenceSync} = await import('./referenceSync')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const ALERTS = 'alerts-1'
const MASKING = 'masking-1'
const CCDC = 'ccdc-1'
const SEGMENTS_ASSET = 'users/x/segments'

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

    it('describes the segments from the producer underneath it', () => {
        sync({selection: {type: 'RECIPE_REF', id: MASKING}})

        expect(reference().dateFormat).toBe(1)
        expect(reference().startDate).toBe('2015-01-01')
        expect(reference().endDate).toBe('2021-01-01')
        expect(reference().baseBands.map(({name}) => name)).toEqual(['red', 'nir'])
        expect(reference().bands).toContain('red_coefs')
        expect(reference().visualizations).toEqual([{id: 'v-red'}])
    })

    it('keeps a directly selected CCDC recipe as the reference', () => {
        sync({selection: {type: 'RECIPE_REF', id: CCDC}})

        expect(reference().id).toBe(CCDC)
        expect(reference().dateFormat).toBe(1)
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

    it('keeps what was configured beside the reference when the asset states none', () => {
        assetMetadata$.mockReturnValue(of(assetMetadata({})))

        sync({selection: {type: 'ASSET', id: SEGMENTS_ASSET, dateFormat: 1}})

        expect(reference().dateFormat).toBe(1)
    })
})

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
                [CCDC]: ccdcRecipe()
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
