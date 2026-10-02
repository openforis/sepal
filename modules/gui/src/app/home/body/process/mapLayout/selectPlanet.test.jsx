import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, describe, expect, it, vi} from 'vitest'

// Editing a saved layer source through its form: what reaches the recipe's layers, and when. The panel is a
// passthrough exposing its buttons, and activation is replaced by the props it would inject.

const {activatable} = vi.hoisted(() => ({activatable: {current: null}}))
vi.mock('~/widget/activation/activatable', () => ({
    withActivatable: () => Component => props => <Component {...props} activatable={activatable.current}/>
}))
vi.mock('~/apiRegistry', () => ({default: {planet: {validateApiKey$: vi.fn()}}}))
vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/widget/panel/panel', () => {
    const Panel = ({children}) => <div>{children}</div>
    Panel.Header = ({title}) => <h1>{title}</h1>
    Panel.Content = ({children}) => <div>{children}</div>
    const Buttons = ({children}) => <div>{children}</div>
    Buttons.Main = ({children}) => <div>{children}</div>
    Buttons.Cancel = ({onClick}) => <button className='cancel' onClick={onClick}/>
    Buttons.Add = ({onClick, disabled}) => <button className='add' disabled={disabled} onClick={onClick}/>
    Buttons.Apply = ({onClick, disabled}) => <button className='apply' disabled={disabled} onClick={onClick}/>
    Panel.Buttons = Buttons
    return {Panel}
})
// Cuts an import cycle the form barrel would otherwise enter from the wrong side (see recipeInput.test.jsx).
vi.mock('~/widget/form/assetCombo', () => ({FormAssetCombo: () => null}))

const {Recipe} = await import('~/app/home/body/process/recipeContext')
const {initStore} = await import('~/store')
const {SelectPlanet} = await import('./selectPlanet')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const OWNER = 'owner'

let root, container, store

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe('editing a Planet layer source', () => {
    it('changes nothing by opening the form', () => {
        const layers = show()

        expect(savedLayers()).toBe(layers)
        expect(container.querySelector('h1').textContent).toBe('map.layout.editImageLayerSource.types.Planet.description')
    })

    it('changes nothing when cancelled after editing', async () => {
        const layers = show()
        await type('description', 'Renamed')

        await click('cancel')

        expect(savedLayers()).toBe(layers)
        expect(activatable.current.deactivate).toHaveBeenCalled()
    })

    it('updates the source in place on Apply, keeping its identity and every area showing it', async () => {
        const layers = show()
        await type('description', 'Renamed')

        await click('apply')

        expect(savedLayers().additionalImageLayerSources).toEqual([
            {id: 'planet-1', type: 'Planet', sourceConfig: {description: 'Renamed', planetApiKey: 'key-1'}}
        ])
        expect(savedLayers().areas).toEqual(layers.areas)
        expect(activatable.current.deactivate).toHaveBeenCalled()
    })
})

const savedLayers = () => store.getState().process.loadedRecipes[OWNER].layers

const type = (name, value) => act(async () => {
    const input = container.querySelector(`input[name="${name}"]`)
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value)
    input.dispatchEvent(new Event('input', {bubbles: true}))
})

const click = className => act(async () => container.querySelector(`button.${className}`).click())

const show = () => {
    const source = {id: 'planet-1', type: 'Planet', sourceConfig: {description: 'Planet', planetApiKey: 'key-1'}}
    const layers = {
        additionalImageLayerSources: [source],
        additionalFeatureLayerSources: [],
        areas: {
            left: {id: 'area-l', imageLayer: {sourceId: 'planet-1', layerConfig: {bands: 'rgb', urlTemplate: 'https://tiles/x'}}, featureLayers: []},
            right: {id: 'area-r', imageLayer: {sourceId: 'planet-1', layerConfig: {bands: 'cir', urlTemplate: 'https://tiles/y'}}, featureLayers: []}
        }
    }
    activatable.current = {deactivate: vi.fn(), source}
    const initialState = {
        dimensions: {width: 1024, height: 768},
        process: {
            loadedRecipes: {[OWNER]: {id: OWNER, type: 'MOSAIC', model: {}, layers, ui: {}}},
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
            <Recipe id={OWNER}>
                <SelectPlanet/>
            </Recipe>
        </Provider>
    ))
    return layers
}
