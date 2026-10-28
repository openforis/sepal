import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {actionBuilder} from '~/action-builder'
import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider, withSourceRuntime} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {initStore} from '~/store'

// A Remapping recipe drawn on another recipe's map, its editor closed: whether its constraints read inputs and bands its
// configuration still has decides whether its image is requested, over a real store and source runtime. Earth Engine is
// faked; its input assets store every band the constraints read, so Earth Engine would build each image.

vi.mock('~/apiRegistry', async () => {
    const {NEVER, of} = await import('rxjs')
    return {default: {
        gee: {
            bands$: ({asset}) => of((ASSET_BANDS[asset] || []).map(name => ({name, arrayDimensions: 0}))),
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
        constructor({previewRequest, watchedProps}) {
            previews.constructed.push(this)
            this.previewRequest = previewRequest
            this.watchedProps = watchedProps
        }
        removeFromMap() {}
    }
}))

const {addRecipeType} = await import('~/app/home/body/process/recipeTypeRegistry')
const {default: remapping} = await import('./remapping')
const {RecipeImageLayer} = await import('../recipeImageLayer')
const {addRecipeImageLayer} = await import('../../recipeImageLayerRegistry')
const {removeInputImage} = await import('../../inputImages')
const {TabContext} = await import('~/widget/tabs/tabContext')
const {getPreSetVisualizations} = await import('./visualizations')

addRecipeType(remapping())
// Remapping's own layer form is replaced by one that reports the layer it is given to draw.
addRecipeImageLayer('REMAPPING', ({layer}) => {
    previews.shown = layer
    return null
})

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const REMAPPING = 'remapping-1'
const HOST = 'host-1'

let root, store, runtime

beforeEach(() => {
    previews.constructed = []
    previews.shown = undefined
    ASSET_BANDS['users/x/dem'] = ['elevation']
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
})

describe('a Remapping layer on another map', () => {
    it.each([false, true])('withdraws and restores the preview when a used source band disappears and returns (downstream: %s)', async downstream => {
        await onAnotherMap(reading('i-2', 'elevation'), downstream)
        expect(previews.shown).toBeTruthy()
        ASSET_BANDS['users/x/dem'] = ['slope']
        await act(async () => runtime.refreshAsset('users/x/dem'))
        await settled()
        expect(previews.shown).toBeNull()
        const builds = previews.constructed.length
        ASSET_BANDS['users/x/dem'] = ['elevation']
        await act(async () => runtime.refreshAsset('users/x/dem'))
        await settled()
        expect(previews.constructed.length).toBeGreaterThan(builds)
        expect(previews.shown).toBe(previews.constructed.at(-1))
    })

    it('is drawn while every constraint reads a band its input includes', async () => {
        await onAnotherMap(reading('i-2', 'elevation'))

        expect(previews.constructed).toHaveLength(1)
        expect(previews.shown).toBe(previews.constructed[0])
    })

    it.each([
        ['an input since removed', reading('i-gone', 'elevation')],
        ['a band its input does not include', reading('i-1', 'ndvi')]
    ])('is not requested while a constraint reads %s', async (_case, constraint) => {
        await onAnotherMap(constraint)

        expect(previews.constructed).toEqual([])
        expect(previews.shown).toBe(null)
    })

    it.each([
        ['its band is deselected', () => setIncludedBands('i-2', [])],
        ['its input is removed', () => removeInputImage(REMAPPING, {imageId: 'i-2'})]
    ])('is taken away once %s, and drawn again once the constraint is repaired', async (_case, change) => {
        await onAnotherMap(reading('i-2', 'elevation'))

        await applied(change)
        expect(previews.shown).toBe(null)
        expect(previews.constructed).toHaveLength(1)

        await applied(() => setConstraint(reading('i-1', 'class')))
        expect(previews.constructed).toHaveLength(2)
        expect(previews.shown).toBe(previews.constructed[1])
    })
})

const ASSET_BANDS = {'users/x/a': ['class', 'ndvi'], 'users/x/dem': ['elevation']}

const LISTING = [
    {id: REMAPPING, name: 'Remapped', type: 'REMAPPING', revision: 1},
    {id: HOST, name: 'Host', type: 'MOSAIC', revision: 1}
]

const reading = (image, band) =>
    ({id: 'c-1', description: `${band} > 1`, image, band, operator: '>', value: 1})

// Two asset inputs, each including one of its bands; the asset of the first also stores `ndvi`.
const remappingModel = constraint => ({
    inputImagery: {images: [
        {imageId: 'i-1', type: 'ASSET', id: 'users/x/a', includedBands: [{id: 'b-class', band: 'class', type: 'continuous'}]},
        {imageId: 'i-2', type: 'ASSET', id: 'users/x/dem', includedBands: [{id: 'b-elevation', band: 'elevation', type: 'continuous'}]}
    ]},
    legend: {entries: [{id: 'l-1', color: '#00ff00', value: 1, label: 'Forest', booleanOperator: 'and', constraints: [constraint]}]}
})

// Drawn in the style Remapping offers for its legend.
async function onAnotherMap(constraint, downstream = false) {
    const remapping = {id: REMAPPING, type: 'REMAPPING', revision: 1, model: remappingModel(constraint), ui: {initialized: true}}
    const dependent = {...remapping, id: 'remapping-2', model: {
        inputImagery: {images: [{imageId: 'upstream', type: 'RECIPE_REF', id: REMAPPING, includedBands: [{band: 'class'}]}]},
        legend: {entries: [{id: 'downstream', value: 1, label: 'Class', color: '#00ff00', constraints: [reading('upstream', 'class')]}]}
    }}
    const initialState = {
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: {
                [REMAPPING]: remapping,
                [dependent.id]: dependent,
                [HOST]: {id: HOST, type: 'MOSAIC', revision: 1, model: {}, ui: {initialized: true}}
            },
            recipes: [...LISTING, {id: dependent.id, name: 'Downstream', type: 'REMAPPING', revision: 1}],
            recipeListing: {checkedAt: Date.now()},
            saveStates: {},
            projects: [],
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
                <Runtime/>
                <Recipe id={HOST}>
                    <TabContext id={HOST} busyIn$={new Subject()}>
                        <RecipeImageLayer
                            source={{id: 'remapping-layer', sourceConfig: {recipeId: downstream ? dependent.id : REMAPPING}}}
                            layerConfig={{visParams: getPreSetVisualizations(downstream ? dependent : remapping)[0]}}
                            map={{}}
                        />
                    </TabContext>
                </Recipe>
            </SourceRuntimeProvider>
        </Provider>
    ))
    await settled()
}

const Runtime = withSourceRuntime()(({sourceRuntime}) => {
    runtime = sourceRuntime
    return null
})

// A change applied to the recipe, as its panel applies it, and everything that follows settled.
async function applied(change) {
    await act(async () => change())
    await settled()
}

const setIncludedBands = (imageId, includedBands) =>
    actionBuilder('SET_INCLUDED_BANDS')
        .set(['process.loadedRecipes', REMAPPING, 'model.inputImagery.images', {imageId}, 'includedBands'], includedBands)
        .dispatch()

const setConstraint = constraint =>
    actionBuilder('UPDATE_LEGEND_ENTRY_CONSTRAINTS')
        .set(['process.loadedRecipes', REMAPPING, 'model.legend.entries', {id: 'l-1'}, 'constraints'], [constraint])
        .dispatch()

async function settled() {
    for (let i = 0; i < 5; i++) {
        await act(async () => {})
    }
}
