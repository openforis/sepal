import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {of, Subject, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {actionBuilder} from '~/action-builder'
import {Recipe} from '~/app/home/body/process/recipeContext'
import {addRecipeType} from '~/app/home/body/process/recipeTypeRegistry'
import {initStore, select} from '~/store'

import createSliceType from './ccdcSlice'

const assetMetadata$ = vi.hoisted(() => vi.fn())
vi.mock('~/apiRegistry', () => ({default: {gee: {assetMetadata$}}}))
vi.mock('~/app/home/map/map', () => ({Map: ({children}) => children}))
vi.mock('../aoi', () => ({Aoi: () => null}))
vi.mock('../recipeImageLayerSource', () => ({initializeLayers: () => {}}))
vi.mock('./panels/ccdcSliceToolbar', () => ({CcdcSliceToolbar: () => null}))
vi.mock('~/translate', () => ({msg: key => key}))

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root
const sliceType = createSliceType()
addRecipeType(sliceType)

beforeEach(() => assetMetadata$.mockReset())
afterEach(() => {
    if (root) {
        act(() => root.unmount())
        root = null
    }
})

describe('opening a saved Slice', () => {
    it('preserves the selected preset when its source is read', () => {
        const saved = aSavedSlice()
        assetMetadata$.mockReturnValue(of(segmentMetadata()))

        openSlice(saved)

        const presets = sliceType.getPreSetVisualizations(currentRecipe())
        expect(presets).toContainEqual(expect.objectContaining(selectedStyle(saved)))
    })

    it('restores the selected preset after the initial read fails and the same source recovers', () => {
        const saved = aSavedSlice()
        assetMetadata$.mockReturnValue(throwError(() => new Error('unreachable')))
        openSlice(saved)
        expect(sliceType.getAvailableBands(currentRecipe())).toEqual({})
        assetMetadata$.mockReturnValue(of(segmentMetadata()))

        act(() => actionBuilder('ASSET_UPDATED')
            .set('assets.user', [{id: ORIGINAL_ASSET.id, updateTime: '2'}])
            .dispatch())

        const presets = sliceType.getPreSetVisualizations(currentRecipe())
        expect(presets).toContainEqual(expect.objectContaining(selectedStyle(saved)))
    })

    it('does not transfer the selected preset to a replacement while the initial read is pending', () => {
        const saved = aSavedSlice()
        const pending = new Subject()
        assetMetadata$.mockReturnValueOnce(pending).mockReturnValue(of(segmentMetadata('3')))
        openSlice(saved)

        act(() => actionBuilder('CHANGE_SOURCE')
            .set(['process.loadedRecipes', saved.id, 'model.source'], REPLACEMENT_ASSET)
            .dispatch())
        act(() => {
            pending.next(segmentMetadata())
            pending.complete()
        })

        const recipe = currentRecipe()
        const presets = sliceType.getPreSetVisualizations(recipe)
        expect(presets).toContainEqual(expect.objectContaining({bands: ['ndvi'], max: [3]}))
        expect(presets.map(({id}) => id)).not.toContain(selectedStyle(saved).id)
        expect(selectedStyle(recipe)).toEqual(selectedStyle(saved))
    })

    it('does not transfer the selected preset to a replacement after the initial read fails', () => {
        const saved = aSavedSlice()
        assetMetadata$.mockReturnValue(throwError(() => new Error('unreachable')))
        openSlice(saved)
        expect(sliceType.getAvailableBands(currentRecipe())).toEqual({})
        assetMetadata$.mockReturnValue(of(segmentMetadata('3')))

        act(() => actionBuilder('CHANGE_SOURCE')
            .set(['process.loadedRecipes', saved.id, 'model.source'], REPLACEMENT_ASSET)
            .dispatch())

        const recipe = currentRecipe()
        const presets = sliceType.getPreSetVisualizations(recipe)
        expect(presets).toContainEqual(expect.objectContaining({bands: ['ndvi'], max: [3]}))
        expect(presets.map(({id}) => id)).not.toContain(selectedStyle(saved).id)
        expect(selectedStyle(recipe)).toEqual(selectedStyle(saved))
    })
})

const openSlice = recipe => {
    const initialState = {
        process: {
            loadedRecipes: {[recipe.id]: recipe},
            tabs: [{id: recipe.id}],
            recipes: []
        },
        assets: {user: [{id: ORIGINAL_ASSET.id, updateTime: '1'}]},
        user: {currentUser: {}}
    }
    const store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    const Slice = sliceType.components.recipe
    root = createRoot(document.createElement('div'))
    act(() => root.render(
        <Provider store={store}>
            <Recipe id={recipe.id}>
                <Slice/>
            </Recipe>
        </Provider>
    ))
}

const currentRecipe = () => select(['process.loadedRecipes', 'slice'])

const selectedStyle = recipe => recipe.layers.areas.center.imageLayer.layerConfig.visParams

const aSavedSlice = ({source = ORIGINAL_ASSET} = {}) => ({
    id: 'slice',
    type: 'CCDC_SLICE',
    model: {
        source,
        date: {dateType: 'SINGLE', date: '2020-06-01'},
        options: {gapStrategy: 'INTERPOLATE', harmonics: 3}
    },
    ui: {initialized: true},
    layers: {
        areas: {
            center: {
                imageLayer: {
                    sourceId: 'this-recipe',
                    layerConfig: {
                        visParams: {id: 'saved-preset', type: 'continuous', bands: ['ndvi'], min: [0], max: [2]}
                    }
                }
            }
        }
    }
})

const segmentMetadata = (max = '2') => ({
    bandNames: ['ndvi_coefs', 'ndvi_rmse', 'ndvi_magnitude'],
    properties: {
        visualization_0_bands: 'ndvi',
        visualization_0_type: 'continuous',
        visualization_0_min: '0',
        visualization_0_max: max
    }
})

const ORIGINAL_ASSET = {type: 'ASSET', id: 'users/test/original', dateFormat: 2}
const REPLACEMENT_ASSET = {type: 'ASSET', id: 'users/test/replacement', dateFormat: 2}
