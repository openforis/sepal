import _ from 'lodash'
import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {Subject} from 'rxjs'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {Recipe} from '~/app/home/body/process/recipeContext'
import {SourceRuntimeProvider} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {initStore} from '~/store'
import crudItemStyles from '~/widget/crudItem.module.css'
import {EventShield} from '~/widget/eventShield'
import {PortalContainer, PortalContext} from '~/widget/portal'

import areaStyles from './areas.module.css'
import layerStyles from './imageLayerSources.module.css'

// A Masking recipe's layout, its Layers list and map areas over a real store, beside its real image-to-mask panel: an
// image the recipe reads is listed as derived from its input, dragged onto the map, and kept there once the panel
// applies another image, and once the recipe is saved and reopened. The recipe picker is replaced by one choosing a
// listed recipe and reporting its bands; panel activation by an always-active panel.

vi.mock('~/translate', () => ({msg: key => Array.isArray(key) ? key.join('.') : key}))
vi.mock('~/app/home/user/userDetails', () => ({userDetailsHint: () => {}}))
vi.mock('~/widget/activation/activatable', () => ({
    withActivatable: () => Component => props => (
        <Component {...props} activatable={{active: true, activate: () => {}, deactivate: () => {}}}/>
    )
}))
vi.mock('~/widget/recipeInput', async () => {
    const {useEffect} = await import('react')
    return {
        RecipeInput: ({input, onBandsLoaded}) => {
            useEffect(() => {
                input.value && onBandsLoaded({recipe: {id: input.value, type: 'MOSAIC', model: {}}, bandNames: ['red']})
            }, [input.value])
            return <button onClick={() => input.set(REPLACEMENT)}>choose {REPLACEMENT}</button>
        }
    }
})
// A tooltip's text is rendered where it is attached, to be read without hovering.
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, children}) => typeof msg === 'string'
        ? <span data-tooltip={msg}>{children}</span>
        : children
}))

const OPTICAL = 'optical-1'
const MASK = 'mask-1'
const REPLACEMENT = 'optical-2'
const LISTING = [{id: OPTICAL, name: 'optical'}, {id: MASK, name: 'mask'}, {id: REPLACEMENT, name: 'optical 2'}]

const {addRecipeType} = await import('~/app/home/body/process/recipeTypeRegistry')
const {default: masking} = await import('../recipe/masking/masking')
const {ImageToMask} = await import('../recipe/masking/panels/inputImage/imageToMask')
const {initializeLayers} = await import('../recipe/recipeImageLayerSource')
const {registerImageLayerSources} = await import('../imageLayerSources')
const {Areas} = await import('./areas')
const {ImageLayerSources} = await import('./imageLayerSources')

addRecipeType(masking())
registerImageLayerSources()

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, store

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    document.body.innerHTML = ''
})

describe('an image a Masking recipe reads, given a map area', () => {
    it('stays there, styled as it was, once another image is applied, saved and reopened', async () => {
        const sourceDrag$ = await open(MASKING)
        expect(rows()).toEqual(['optical', 'mask'])

        await dragOntoMap(sourceDrag$, OPTICAL)
        await style(OPTICAL)
        const layers = recipe().layers

        await click(`choose ${REPLACEMENT}`)
        await click('button.apply')

        expect(recipe().model.imageToMask.id).toBe(REPLACEMENT)
        expect(recipe().layers).toEqual(layers)
        expect(rows()).toEqual(['optical 2', 'mask', 'optical'])

        await open(savedAndReopened())

        expect(rows()).toEqual(['optical 2', 'mask', 'optical'])
        expect(rowTooltip('optical')).toBe('map.layout.legacySource')
        expect(shownOnMap()).toBe('optical')
        expect(recipe().layers.areas.center.imageLayer).toEqual(layers.areas.center.imageLayer)
        expect(recipe().layers.userDefinedVisualizations).toEqual(layers.userDefinedVisualizations)
    })
})

// As the Masking it was created as: its area shows the recipe itself.
const MASKING = {
    id: 'masking-1',
    type: 'MASKING',
    model: {
        imageToMask: {type: 'RECIPE_REF', id: OPTICAL, bands: ['red'], visualizations: []},
        imageMask: {type: 'RECIPE_REF', id: MASK, bands: ['red'], visualizations: []}
    }
}

// The layout and the panel, mounted as the recipe opens: its saved layers kept, its own sources added.
const open = async model => {
    await act(async () => root?.unmount())
    const sourceDrag$ = new Subject()
    store = createStore(
        (state = {
            dimensions: {width: 1024, height: 768},
            process: {loadedRecipes: {[model.id]: model}, recipes: LISTING, projects: [], tabs: []}
        }, action) => action.reduce ? action.reduce(state) : state
    )
    initStore(store)
    initializeLayers({recipeId: model.id, savedLayers: model.layers})
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
                        <Recipe id={model.id}>
                            <ImageLayerSources/>
                            <Areas sourceDrag$={sourceDrag$}/>
                            <ImageToMask/>
                        </Recipe>
                    </SourceRuntimeProvider>
                </EventShield>
            </PortalContext>
        </Provider>
    ))
    return sourceDrag$
}

// A source's row dragged over the areas and released, as Layers emits the drag: the only area there is takes it.
const dragOntoMap = async (sourceDrag$, sourceId) => {
    const value = {id: `area-${sourceId}`, imageLayer: {sourceId}, featureLayers: []}
    await act(async () => document.querySelector(`.${areaStyles.container}`).dispatchEvent(new MouseEvent('mouseover', {bubbles: true})))
    await act(() => new Promise(resolve => setTimeout(resolve, 150)))
    for (const event of [{dragging: true, value}, {coords: {x: 0, y: 0}}, {coords: {x: 1, y: 1}}, {dragging: false}]) {
        await act(async () => sourceDrag$.next(event))
    }
}

// A style made for the source in the area, as the layer's style menu saves one.
const style = sourceId => act(async () => store.dispatch({
    type: 'STYLE_SOURCE',
    reduce: state => _.set(_.cloneDeep(state), ['process', 'loadedRecipes', MASKING.id, 'layers', 'userDefinedVisualizations', sourceId],
        [{id: 'v-1', type: 'rgb', bands: ['red', 'green', 'blue'], userDefined: true}])
}))

const click = label => act(async () => {
    const button = [...document.querySelectorAll('button')].find(button => button.textContent.trim() === label)
    expect(button, `no button labelled ${label}`).toBeDefined()
    button.click()
})

const recipe = () => store.getState().process.loadedRecipes[MASKING.id]

// What saving keeps of the recipe - everything but its view state - read back as a recipe opens.
const savedAndReopened = () => JSON.parse(JSON.stringify(_.omit(recipe(), ['ui'])))

// The image sources Layers lists that show a listed recipe, by the description each shows.
const rows = () => sourceRows()
    .map(row => description(row))
    .filter(name => LISTING.some(listed => listed.name === name))

const rowTooltip = name => sourceRows()
    .find(row => description(row) === name)
    ?.querySelector('[data-tooltip]')?.dataset.tooltip

const shownOnMap = () => description(document.querySelector(`.${areaStyles.areaContent}`))

const sourceRows = () => [...document.querySelectorAll(`.${layerStyles.imageSource}, .${layerStyles.removableImageSource}`)]

const description = element => element?.querySelector(`.${crudItemStyles.description}`)?.textContent
