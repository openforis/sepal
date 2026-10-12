import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {of} from 'rxjs'
import {afterEach, describe, expect, it, vi} from 'vitest'

// Adding and editing a recipe layer source through its form. The panel is a passthrough exposing its buttons, and
// activation is replaced by the props it would inject. Where a scenario chooses a recipe, the picker is replaced by one
// offering each listed recipe and reporting the chosen one loaded.

const {activatable} = vi.hoisted(() => ({activatable: {current: null}}))
vi.mock('~/widget/activation/activatable', () => ({
    withActivatable: () => Component => props => <Component {...props} activatable={activatable.current}/>
}))
vi.mock('~/apiRegistry', () => ({default: {recipe: {load$: id => of({id, type: 'MOSAIC', model: {}})}}}))
const picker = vi.hoisted(() => ({stubbed: false}))
vi.mock('~/widget/recipeInput', async importOriginal => {
    const {RecipeInput} = await importOriginal()
    const {useEffect} = await import('react')
    const ListedRecipes = ({input, onRecipeLoaded}) => {
        useEffect(() => {
            input.value && onRecipeLoaded({recipe: {id: input.value, type: 'MOSAIC', title: `Recipe ${input.value}`}})
        }, [input.value])
        return ['recipe-2', 'recipe-3'].map(id => <button key={id} className='choose' onClick={() => input.set(id)}>{id}</button>)
    }
    return {RecipeInput: props => picker.stubbed ? <ListedRecipes {...props}/> : <RecipeInput {...props}/>}
})
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

let root, container, store

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
    picker.stubbed = false
})

describe('editing a recipe layer source', () => {
    // Only the owner's project is offered until ALL is chosen; the layer may show a recipe from any.
    it('shows the recipe it references when that recipe is in another project', () => {
        show({id: 'elsewhere', name: 'In another project', type: 'MOSAIC', projectId: 'p2'})

        expect(container.querySelector('input').placeholder).toBe('In another project')
    })
})

describe('a recipe layer source\'s name', () => {
    it('is saved with a source added under it, apart from what the source shows', async () => {
        await open()

        await choose('recipe-2')
        await type('Before the fire')
        await press('add')

        const [added] = layers().additionalImageLayerSources
        expect(added.sourceConfig).toEqual({recipeId: 'recipe-2'})
        expect(layers().imageLayerSourceNames).toEqual({[added.id]: 'Before the fire'})
    })

    it('is offered for editing, and cleared, the layer is called by its recipe again', async () => {
        await open({source: SOURCE, names: {[SOURCE.id]: 'Before the fire'}})
        expect(nameInput().value).toBe('Before the fire')

        await type('')
        await press('apply')

        expect(layers().imageLayerSourceNames).toEqual({})
        expect(layers().additionalImageLayerSources).toEqual([SOURCE])
    })

    it('is kept when the source is made to show another recipe', async () => {
        await open({source: SOURCE, names: {[SOURCE.id]: 'Before the fire'}})

        await choose('recipe-3')
        await press('apply')

        expect(layers().additionalImageLayerSources[0].sourceConfig.recipeId).toBe('recipe-3')
        expect(layers().imageLayerSourceNames).toEqual({[SOURCE.id]: 'Before the fire'})
    })

    it('is not saved, nor the recipe chosen, when the edit is cancelled', async () => {
        await open({source: SOURCE, names: {[SOURCE.id]: 'Before the fire'}})
        const before = layers()

        await choose('recipe-3')
        await type('After the fire')
        await press('cancel')

        expect(layers()).toBe(before)
    })
})

const SOURCE = {id: 'source-1', type: 'Recipe', sourceConfig: {recipeId: 'recipe-2', description: 'Recipe recipe-2'}}

// The form opened to add a source, or to edit `source`, over a layout naming `names`.
const open = async ({source, names} = {}) => {
    picker.stubbed = true
    activatable.current = {deactivate: vi.fn(), source}
    await act(async () => mount({
        additionalImageLayerSources: source ? [source] : [],
        ...(names ? {imageLayerSourceNames: names} : {})
    }))
}

const choose = id => act(async () => [...container.querySelectorAll('button.choose')].find(button => button.textContent === id).click())

const nameInput = () => container.querySelector('input[name="name"]')

const type = value => act(async () => {
    const input = nameInput()
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value)
    input.dispatchEvent(new Event('input', {bubbles: true}))
})

const press = button => act(async () => container.querySelector(`button.${button}`).click())

const layers = () => store.getState().process.loadedRecipes[OWNER].layers

const show = referenced => {
    const source = {id: 'source-1', type: 'Recipe', sourceConfig: {recipeId: referenced.id}}
    activatable.current = {deactivate: vi.fn(), source}
    act(() => mount({additionalImageLayerSources: [source]}, [referenced]))
}

const mount = (layers, referenced = []) => {
    const initialState = {
        dimensions: {width: 1024, height: 768},
        process: {
            loadedRecipes: {
                [OWNER]: {id: OWNER, type: 'MOSAIC', projectId: 'p1', model: {}, layers, ui: {}}
            },
            recipes: [{id: OWNER, name: 'The owner', type: 'MOSAIC', projectId: 'p1'}, ...referenced],
            projects: [{id: 'p1', name: 'Project one'}, {id: 'p2', name: 'Project two'}],
            tabs: []
        }
    }
    store = createStore((state = initialState, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    root.render(
        <Provider store={store}>
            <Recipe id={OWNER}>
                <SelectRecipe/>
            </Recipe>
        </Provider>
    )
}
