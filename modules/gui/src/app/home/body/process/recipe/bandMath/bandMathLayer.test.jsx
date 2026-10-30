import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {actionBuilder} from '~/action-builder'
import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {initStore} from '~/store'

// A Band Math recipe drawn on another recipe's map, its editor closed: what its configuration needs of itself decides
// whether its image is requested, over a real store and source runtime. Earth Engine is faked.

vi.mock('~/apiRegistry', async () => {
    const {NEVER, of} = await import('rxjs')
    return {default: {
        gee: {
            // Its input asset holds both bands it includes, and the running image observed carries the configured
            // output, as Earth Engine builds it.
            bands$: ({asset}) => of((asset ? ['red', 'nir'] : ['red']).map(name => ({name, arrayDimensions: 0}))),
            // Its input asset is current.
            assetVersions$: ({ids}) => of({assets: ids.map(id => ({id, type: 'IMAGE', version: 'v1'}))})
        },
        recipe: {save$: () => NEVER, load$: () => NEVER, loadAll$: () => of(LISTING)}
    }}
})
vi.mock('~/translate', () => ({msg: (key, values) => values ? `${key} ${JSON.stringify(values)}` : key}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
// Constructing a preview layer is what requests a preview: the map mounts it and Earth Engine is asked for its tiles.
const previews = vi.hoisted(() => ({constructed: [], shown: undefined}))
vi.mock('~/app/home/map/layer/earthEngineImageLayer', () => ({
    EarthEngineImageLayer: class {
        constructor({previewRequest}) {
            previews.constructed.push(this)
            this.previewRequest = previewRequest
        }
        removeFromMap() {}
    }
}))

const {addRecipeType} = await import('~/app/home/body/process/recipeTypeRegistry')
const {default: remapping} = await import('../remapping/remapping')
const {getPreSetVisualizations} = await import('../remapping/visualizations')
const {default: bandMath} = await import('./bandMath')
const {RecipeImageLayer} = await import('../recipeImageLayer')
const {addRecipeImageLayer} = await import('../../recipeImageLayerRegistry')
const {TabContext} = await import('~/widget/tabs/tabContext')

addRecipeType(bandMath())
addRecipeType(remapping())
// Band Math's own layer form is replaced by one that reports the layer it is given to draw.
const showLayer = ({layer}) => {
    previews.shown = layer
    return null
}
addRecipeImageLayer('BAND_MATH', showLayer)
addRecipeImageLayer('REMAPPING', showLayer)

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const BAND_MATH = 'band-math-1'
const HOST = 'host-1'

let root, store

beforeEach(() => {
    previews.constructed = []
    previews.shown = undefined
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
})

describe('a Band Math layer on another map', () => {
    it('is drawn while its calculations are met', async () => {
        await onAnotherMap('i1.nir * 2')

        expect(previews.constructed).toHaveLength(1)
        expect(previews.shown).toBe(previews.constructed[0])
    })

    it('is not requested while a calculation reads a band no longer selected', async () => {
        await onAnotherMap('i1.swir * 2')

        expect(previews.constructed).toEqual([])
        expect(previews.shown).toBe(null)
    })

    it('is taken away once a calculation becomes unmet, and drawn again once it is repaired', async () => {
        await onAnotherMap('i1.nir * 2')

        await setExpression('i1.swir * 2')
        expect(previews.shown).toBe(null)
        expect(previews.constructed).toHaveLength(1)

        await setExpression('i1.nir * 2')
        expect(previews.constructed).toHaveLength(2)
        expect(previews.shown).toBe(previews.constructed[1])
    })
})

describe('a Remapping over Band Math on another map', () => {
    it('is withdrawn for an upstream broken reference and restored when repaired', async () => {
        await onAnotherMap('i1.nir * 2', true)
        expect(previews.constructed).toHaveLength(1)
        await setExpression('gone.nir * 2')
        expect(previews.shown).toBe(null)
        expect(previews.constructed).toHaveLength(1)
        await setExpression('i1.nir * 2')
        expect(previews.constructed).toHaveLength(2)
        expect(previews.shown).toBe(previews.constructed[1])
    })
})

const RED = {id: 'red-id', name: 'red'}
const NIR = {id: 'nir-id', name: 'nir'}
const STYLE = {type: 'continuous', bands: ['red'], min: [0], max: [1], palette: ['#000000', '#FFFFFF']}
const INPUT = {
    imageId: 'img-1', name: 'i1', type: 'ASSET', id: 'users/x/image', includedBands: [RED, NIR],
    visualizations: [STYLE]
}

const LISTING = [
    {id: BAND_MATH, name: 'Math', type: 'BAND_MATH', revision: 1},
    {id: 'over-math', name: 'Remapping', type: 'REMAPPING', revision: 1},
    {id: HOST, name: 'Host', type: 'MOSAIC', revision: 1}
]

const bandMathModel = expression => ({
    inputImagery: {images: [INPUT]},
    calculations: {calculations: [{
        imageId: 'calc-1', name: 'c1', type: 'EXPRESSION', expression, dataType: 'auto',
        usedBands: [], includedBands: [{...NIR, imageId: 'img-1', imageName: 'i1'}]
    }]},
    outputBands: {outputImages: [{...INPUT, outputBands: [{...RED, defaultOutputName: 'red'}]}]}
})

async function onAnotherMap(expression, downstream = false) {
    const initialState = {
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: {
                [BAND_MATH]: {id: BAND_MATH, type: 'BAND_MATH', revision: 1, model: bandMathModel(expression), ui: {initialized: true}},
                'over-math': {id: 'over-math', type: 'REMAPPING', revision: 1, ui: {initialized: true}, model: {
                    inputImagery: {images: [{imageId: 'math', type: 'RECIPE_REF', id: BAND_MATH, includedBands: [{band: 'red'}]}]},
                    legend: {entries: [{id: 'class', value: 1, label: 'Class', color: '#123456'}]}
                }},
                [HOST]: {id: HOST, type: 'MOSAIC', revision: 1, model: {}, ui: {initialized: true}}
            },
            recipes: LISTING,
            recipeListing: {checkedAt: Date.now()},
            saveStates: {},
            folders: [],
            tabs: [{id: HOST}]
        },
        assets: {user: [], other: []},
        dimensions: {width: 1024, height: 768}
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    root = createRoot(document.createElement('div'))
    await act(async () => root.render(
        <Provider store={store}>
            <SourceRuntimeProvider>
                <Recipe id={HOST}>
                    <TabContext id={HOST} busyIn$={new Subject()}>
                        <RecipeImageLayer
                            source={{id: 'band-math-layer', sourceConfig: {recipeId: downstream ? 'over-math' : BAND_MATH}}}
                            layerConfig={{visParams: downstream ? getPreSetVisualizations(initialState.process.loadedRecipes['over-math'])[0] : STYLE}}
                            map={{}}
                        />
                    </TabContext>
                </Recipe>
            </SourceRuntimeProvider>
        </Provider>
    ))
    await settled()
}

// The calculation's expression changed, as its panel applies it.
async function setExpression(expression) {
    await act(async () => actionBuilder('SET_EXPRESSION')
        .set(['process.loadedRecipes', BAND_MATH, 'model.calculations.calculations', {imageId: 'calc-1'}, 'expression'], expression)
        .dispatch())
    await settled()
}

async function settled() {
    for (let i = 0; i < 5; i++) {
        await act(async () => {})
    }
}
