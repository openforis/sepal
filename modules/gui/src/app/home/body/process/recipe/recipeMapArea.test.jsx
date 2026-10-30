import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider, useSelector} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {actionBuilder} from '~/action-builder'
import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {selectFrom} from '~/stateUtils'
import {initStore} from '~/store'

// A recipe's own map area, as the map renders it (map.jsx): the layer source assigned to the area, the recipe's layer
// form, the shared layout and its menu. Whatever its image cannot render yet, the area keeps its menu and the overlays it
// controls; what is held is the image alone, by the shared gates (recipeImageLayer.jsx), and repairing the recipe draws
// it with the selection the area kept. Store, source runtime, activation, layout and menu are real; Earth Engine and the
// Google map are faked.

vi.mock('~/apiRegistry', async () => {
    const {NEVER, of} = await import('rxjs')
    return {default: {
        gee: {
            // Its input asset holds both bands it includes, and the image observed carries the configured output.
            bands$: ({asset}) => of((asset ? ['red', 'nir'] : ['red']).map(name => ({name, arrayDimensions: 0}))),
            assetVersions$: ({ids}) => of({assets: ids.map(id => ({id, type: 'IMAGE', version: 'v1'}))}),
            // The geometry its AOI overlay draws is not the concern here: it never answers.
            recipeGeometry$: () => NEVER
        },
        recipe: {save$: () => NEVER, load$: () => NEVER, loadAll$: () => of(LISTING)}
    }}
})
vi.mock('~/translate', () => ({msg: (key, values) => values ? `${key} ${JSON.stringify(values)}` : key}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
// Constructing a preview layer is what requests a preview: the map mounts it and Earth Engine is asked for its tiles.
const previews = vi.hoisted(() => ({constructed: []}))
vi.mock('~/app/home/map/layer/earthEngineImageLayer', () => ({
    EarthEngineImageLayer: class {
        constructor({watchedProps}) {
            previews.constructed.push(this)
            this.watchedProps = watchedProps
        }
        removeFromMap() {}
    }
}))

const {addRecipeType} = await import('~/app/home/body/process/recipeTypeRegistry')
const {default: bandMath} = await import('./bandMath/bandMath')
const {default: stack} = await import('./stack/stack')
const {registerRecipeImageLayers} = await import('../recipeImageLayers')
const {registerImageLayerSources} = await import('../imageLayerSources')
const {getImageLayerSource} = await import('../imageLayerSourceRegistry')
const {initializeLayers} = await import('./recipeImageLayerSource')
const {MapAreaContext} = await import('~/app/home/map/mapAreaContext')
const {ActivationContext} = await import('~/widget/activation/activationContext')
const {EventShield} = await import('~/widget/eventShield')
const {PortalContainer, PortalContext} = await import('~/widget/portal')
const {TabContext} = await import('~/widget/tabs/tabContext')
const {SplitContext} = await import('~/widget/split/splitContext')

addRecipeType(bandMath())
addRecipeType(stack())
registerRecipeImageLayers()
registerImageLayerSources()

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container, store

beforeEach(() => {
    previews.constructed = []
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe('a Band Math map area', () => {
    it('keeps its menu and overlays while nothing is output, requesting no preview', async () => {
        await open(bandMathRecipe([]))

        expect(menuButton()?.disabled).toBe(false)
        expect(previews.constructed).toEqual([])

        await openMenu()
        await toggleOverlay(LABELS)

        expect(overlayEnabled(LABELS)).toBe(true)
        expect(previews.constructed).toEqual([])
    })

    it('keeps its menu and selection while an output is configured wrongly, and draws once it is repaired', async () => {
        await open(bandMathRecipe([OUTPUT]))
        expect(previews.constructed).toHaveLength(1)

        await setOutputs([OUTPUT, {...OUTPUT, imageId: 'img-1', outputBands: [{...RED, id: 'copy', defaultOutputName: 'red'}]}])

        expect(menuButton()?.disabled).toBe(false)
        expect(previews.constructed).toHaveLength(1)
        expect(selectedVisualization()).toEqual(STYLE)

        await setOutputs([OUTPUT])

        expect(previews.constructed).toHaveLength(2)
        expect(selectedVisualization()).toEqual(STYLE)
    })
})

describe('a Stack map area', () => {
    it('keeps its menu and overlays while it stacks nothing, requesting no preview', async () => {
        await open({id: ID, type: 'STACK', revision: 1, ui: {initialized: true}, model: {inputImagery: {images: []}, bandNames: {bandNames: []}}})

        expect(menuButton()?.disabled).toBe(false)

        await openMenu()
        await toggleOverlay(LABELS)

        expect(overlayEnabled(LABELS)).toBe(true)
        expect(previews.constructed).toEqual([])
    })
})

const ID = 'recipe-1'
const LISTING = [{id: ID, name: 'Recipe', type: 'BAND_MATH', revision: 1}]
const LABELS = 'featureLayerSources.Labels.type'
const RED = {id: 'red-id', name: 'red'}
const NIR = {id: 'nir-id', name: 'nir'}
const STYLE = {type: 'continuous', bands: ['red'], min: [0], max: [1], palette: ['#000000', '#FFFFFF']}
const INPUT = {imageId: 'img-1', name: 'i1', type: 'ASSET', id: 'users/x/image', includedBands: [RED, NIR], visualizations: [STYLE]}
const OUTPUT = {...INPUT, outputBands: [{...RED, defaultOutputName: 'red'}]}

const bandMathRecipe = outputImages => ({
    id: ID,
    type: 'BAND_MATH',
    revision: 1,
    ui: {initialized: true},
    model: {inputImagery: {images: [INPUT]}, calculations: {calculations: []}, outputBands: {outputImages}}
})

// The recipe's own image in its center area, as a recipe opens with no saved layers, showing STYLE.
async function open(recipe) {
    const initialState = {
        user: {currentUser: {googleTokens: {accessToken: 'token'}}},
        process: {
            loadedRecipes: {[ID]: recipe},
            recipes: LISTING,
            recipeListing: {checkedAt: Date.now()},
            saveStates: {},
            folders: [],
            tabs: [{id: ID}]
        },
        assets: {user: [], other: []},
        dimensions: {width: 1024, height: 768}
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    initializeLayers({recipeId: ID})
    actionBuilder('SELECT_VISUALIZATION')
        .set(['process.loadedRecipes', ID, 'layers.areas.center.imageLayer.layerConfig'], {visParams: STYLE})
        .dispatch()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(
        <Provider store={store}>
            <ActivationContext id='root'>
                <SourceRuntimeProvider>
                    <Recipe id={ID}>
                        <TabContext id={ID} busyIn$={new Subject()}>
                            <EventShield>
                                <PortalContainer/>
                                <PortalContainer id='panels'/>
                                <PortalContext id='panels'>
                                    <SplitContext.Provider value={{container, mode: 'grid', maximize: null}}>
                                        <CenterArea/>
                                    </SplitContext.Provider>
                                </PortalContext>
                            </EventShield>
                        </TabContext>
                    </Recipe>
                </SourceRuntimeProvider>
            </ActivationContext>
        </Provider>
    ))
    await settled()
}

// The center area as the map renders it (map.jsx renderImageLayer), over a map that only takes layers.
const CenterArea = () => {
    const recipe = useSelector(state => state.process.loadedRecipes[ID])
    const {sourceId, layerConfig} = recipe.layers.areas.center.imageLayer
    const source = recipe.ui.imageLayerSources.find(({id}) => id === sourceId)
    return (
        <MapAreaContext mapArea={{
            area: 'center',
            updateLayerConfig: layerConfig => actionBuilder('UPDATE_LAYER_CONFIG')
                .set(['process.loadedRecipes', ID, 'layers.areas.center.imageLayer.layerConfig'], layerConfig)
                .dispatch(),
            includeAreaFeatureLayerSource: () => {},
            excludeAreaFeatureLayerSource: () => {}
        }}>
            {getImageLayerSource({recipe, source, layerConfig, map: MAP}).layerComponent}
        </MapAreaContext>
    )
}

const MAP = {setLayer: () => {}, removeLayer: () => {}}

// The output images as Output bands' Apply leaves them.
async function setOutputs(outputImages) {
    await act(async () => actionBuilder('SET_OUTPUTS')
        .set(['process.loadedRecipes', ID, 'model.outputBands.outputImages'], outputImages)
        .dispatch())
    await settled()
}

const menuButton = () => document.querySelector('svg[data-icon="bars"]')?.closest('button') || null

async function openMenu() {
    await act(async () => menuButton().click())
    await settled()
}

const overlayToggle = label => [...document.querySelectorAll('button[aria-pressed]')].find(button => button.textContent === label)

async function toggleOverlay(label) {
    await act(async () => overlayToggle(label).click())
    await settled()
}

const overlayEnabled = label => overlayToggle(label).getAttribute('aria-pressed') === 'true'

const selectedVisualization = () =>
    selectFrom(store.getState(), ['process.loadedRecipes', ID, 'layers.areas.center.imageLayer.layerConfig.visParams'])

async function settled() {
    for (let i = 0; i < 8; i++) {
        await act(async () => {})
    }
}
