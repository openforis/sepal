import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {initStore} from '~/store'

vi.mock('~/translate', () => ({msg: key => key}))
// The copy has its own test; what it is handed to copy is the contract here.
vi.mock('~/widget/copyButton', () => ({CopyButton: ({value}) => <button data-copy={value}/>}))

import {RecipeTabTooltip} from './recipeLocation'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('RecipeTabTooltip', () => {
    it('gives the folders holding the recipe, then its name', () => {
        show(<RecipeTabTooltip recipeId={RECIPE} name='Nairobi'/>)

        expect(container.textContent).toBe('/ Kenya / 2024 / Nairobi')
    })

    it('starts the path of a recipe in no folder with the root alone', () => {
        show(<RecipeTabTooltip recipeId={RECIPE} name='Nairobi'/>, {folderId: null})

        expect(container.textContent).toBe('/ Nairobi')
    })

    // As the recipe list shows it.
    it('starts the path of a recipe whose folder is gone with the root alone', () => {
        show(<RecipeTabTooltip recipeId={RECIPE} name='Nairobi'/>, {folderId: 'gone'})

        expect(container.textContent).toBe('/ Nairobi')
    })

    it('follows the recipe when it moves', () => {
        show(<RecipeTabTooltip recipeId={RECIPE} name='Nairobi'/>)

        moveTo(KENYA.id)

        expect(container.textContent).toBe('/ Kenya / Nairobi')
    })

    it('offers to copy that path, without the spaces around the slashes', () => {
        show(<RecipeTabTooltip recipeId={RECIPE} name='Nairobi'/>)

        expect(container.querySelector('[data-copy]').dataset.copy).toBe('/Kenya/2024/Nairobi')
    })
})

const RECIPE = 'r1'
const KENYA = {id: 'kenya', name: 'Kenya', parentId: null}
const Y2024 = {id: '2024', name: '2024', parentId: 'kenya'}

let store
let container
let unmount

const stateWith = ({folderId = Y2024.id} = {}) => ({
    dimensions: {width: 1024, height: 768},
    process: {
        folders: [KENYA, Y2024],
        loadedRecipes: {[RECIPE]: {id: RECIPE, type: 'MOSAIC', folderId}}
    }
})

const show = (element, state) => {
    store = createStore((state, action) => action.type === 'REPLACE' ? action.state : state, stateWith(state))
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => root.render(<Provider store={store}>{element}</Provider>))
    unmount = () => {
        act(() => root.unmount())
        container.remove()
    }
}

const moveTo = folderId => act(() => store.dispatch({type: 'REPLACE', state: stateWith({folderId})}))

beforeEach(() => {
    unmount = null
})

afterEach(() => {
    unmount && unmount()
})
