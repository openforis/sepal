import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {initStore} from '~/store'

// Opening a PyEO Alerts recipe asks Earth Engine for the bounds of its area of interest, to frame the map.
// A recipe that has no area of interest yet has no bounds to ask for, and asking anyway is a failed request
// the user did nothing to cause. Bounds are worth having as soon as one is configured, whether or not the
// rest of the recipe is finished.
//
// The real recipe component and the real shared area-of-interest component are rendered over a real store;
// the map, the toolbar and Earth Engine are the substitutes.

const recipeBounds$ = vi.fn()
vi.mock('~/apiRegistry', () => ({default: {gee: {recipeBounds$: (...args) => recipeBounds$(...args)}}}))
vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/app/home/map/map', () => ({Map: ({children}) => <div>{children}</div>}))
vi.mock('./panels/pyeoAlertsToolbar', () => ({PyeoAlertsToolbar: () => null}))
vi.mock('~/app/home/body/process/recipe/recipeImageLayerSource', () => ({initializeLayers: () => {}}))
vi.mock('~/app/home/map/mapContext', () => ({
    withMap: () => Component => props => <Component {...props} map={{
        linked$: {getValue: () => ({linked: false})},
        fitBounds: () => {}
    }}/>
}))

const {default: pyeoAlertsType} = await import('./pyeoAlerts')
const {defaultModel} = await import('./pyeoAlertsRecipe')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const RECIPE = 'pyeo-1'
const AOI = {type: 'EE_TABLE', id: 'users/x/boundary'}

describe('a recipe with no area of interest', () => {
    it('asks for no bounds when it has just been created', () => {
        open(defaultModel.aoi)

        expect(recipeBounds$).not.toHaveBeenCalled()
    })

    it('asks for no bounds for the empty object older recipes were saved with', () => {
        open({})

        expect(recipeBounds$).not.toHaveBeenCalled()
    })
})

describe('a recipe whose area of interest is configured', () => {
    it('asks for the bounds of the area it names', () => {
        open(AOI)

        expect(boundsRequestedFor()).toEqual([AOI])
    })

    // Bounds frame the map as soon as there is an area to frame; the remaining wizard steps are a separate
    // question, and the request must carry what was just configured rather than what the recipe held.
    it('asks for them as soon as one is configured, before the recipe is finished', async () => {
        open({})

        await configure(AOI)

        expect(boundsRequestedFor()).toEqual([AOI])
    })
})

const boundsRequestedFor = () => recipeBounds$.mock.calls.map(([recipe]) => recipe.model.aoi)

let root, container, store

beforeEach(() => {
    recipeBounds$.mockReset().mockReturnValue(of({}))
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
    vi.restoreAllMocks()
})

const configure = aoi => act(async () => store.dispatch({
    type: 'SET_AOI',
    reduce: state => ({
        ...state,
        process: {
            ...state.process,
            loadedRecipes: {
                ...state.process.loadedRecipes,
                [RECIPE]: {
                    ...state.process.loadedRecipes[RECIPE],
                    model: {...state.process.loadedRecipes[RECIPE].model, aoi}
                }
            }
        }
    })
}))

const open = aoi => {
    const PyeoAlerts = pyeoAlertsType().components.recipe
    const initialState = {
        process: {
            loadedRecipes: {
                [RECIPE]: {
                    id: RECIPE,
                    type: 'PYEO_ALERTS',
                    model: {...defaultModel, ...(aoi === undefined ? {} : {aoi})}
                }
            },
            recipes: [],
            projects: [],
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
            <Recipe id={RECIPE}>
                <PyeoAlerts/>
            </Recipe>
        </Provider>
    ))
}
