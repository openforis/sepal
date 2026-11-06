import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, describe, expect, it, vi} from 'vitest'

vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/connect', () => ({connect: () => Component => Component}))
vi.mock('~/widget/activation/activator', () => ({withActivators: () => Component => Component}))
vi.mock('~/widget/menu', () => {
    const Menu = ({children}) => <div>{children}</div>
    Menu.Item = ({onSelect, children}) => <button onClick={onSelect}>{children}</button>
    return {Menu}
})
vi.mock('./recipe', () => ({duplicateRecipe: vi.fn(), exportRecipe$: vi.fn()}))

import {ProcessMenu} from './processMenu'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('ProcessMenu', () => {
    it('offers to move a saved recipe to another folder', () => {
        const {activator} = show({recipes: [RECIPE]})

        act(() => item('process.menu.moveRecipe.label').click())

        expect(activator.activatables.moveRecipeDialog.activate).toHaveBeenCalledWith({recipe: RECIPE})
    })

    // An unsaved recipe is not on the server to be moved; it is saved into the folder it was made in.
    it('does not offer to move a recipe that was never saved', () => {
        show({recipes: []})

        expect(item('process.menu.moveRecipe.label')).toBeUndefined()
    })
})

const RECIPE = {id: 'r1', type: 'MOSAIC', folderId: 'kenya', ui: {initialized: true}}

let unmount

const show = ({recipes}) => {
    const activator = {activatables: {saveRecipeDialog: {activate: vi.fn()}, moveRecipeDialog: {activate: vi.fn()}}}
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => root.render(<ProcessMenu recipe={RECIPE} recipes={recipes} activator={activator}/>))
    unmount = () => {
        act(() => root.unmount())
        container.remove()
    }
    return {activator}
}

const item = label => [...document.querySelectorAll('button')].find(({textContent}) => textContent === label)

afterEach(() => {
    unmount && unmount()
    unmount = null
})
