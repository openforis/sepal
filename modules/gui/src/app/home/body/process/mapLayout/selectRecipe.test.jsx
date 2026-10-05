import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {of} from 'rxjs'
import {afterEach, describe, expect, it, vi} from 'vitest'

// Editing a saved recipe layer source through its form. The panel is a passthrough exposing its buttons, and
// activation is replaced by the props it would inject.

const {activatable} = vi.hoisted(() => ({activatable: {current: null}}))
vi.mock('~/widget/activation/activatable', () => ({
    withActivatable: () => Component => props => <Component {...props} activatable={activatable.current}/>
}))
vi.mock('~/apiRegistry', () => ({default: {recipe: {load$: id => of({id, type: 'MOSAIC', model: {}})}}}))
vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/app/home/body/process/recipeTypeRegistry', () => ({
    getRecipeType: type => ({id: type}),
    isImageSource: () => true
}))
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
const {SelectRecipe} = await import('./selectRecipe')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const OWNER = 'owner'

let root, container

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe('editing a recipe layer source', () => {
    // Only the owner's project is offered until ALL is chosen; the layer may show a recipe from any.
    it('shows the recipe it references when that recipe is in another project', () => {
        show({id: 'elsewhere', name: 'In another project', type: 'MOSAIC', projectId: 'p2'})

        expect(container.querySelector('input').placeholder).toBe('In another project')
    })
})

const show = referenced => {
    const source = {id: 'source-1', type: 'Recipe', sourceConfig: {recipeId: referenced.id}}
    activatable.current = {deactivate: vi.fn(), source}
    const initialState = {
        dimensions: {width: 1024, height: 768},
        process: {
            loadedRecipes: {
                [OWNER]: {id: OWNER, type: 'MOSAIC', projectId: 'p1', model: {}, layers: {additionalImageLayerSources: [source]}, ui: {}}
            },
            recipes: [{id: OWNER, name: 'The owner', type: 'MOSAIC', projectId: 'p1'}, referenced],
            projects: [{id: 'p1', name: 'Project one'}, {id: 'p2', name: 'Project two'}],
            tabs: []
        }
    }
    const store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root.render(
        <Provider store={store}>
            <Recipe id={OWNER}>
                <SelectRecipe/>
            </Recipe>
        </Provider>
    ))
}
