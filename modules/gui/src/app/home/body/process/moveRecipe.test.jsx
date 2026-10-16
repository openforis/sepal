import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const {moveRecipes$, offerMoveUndo, pickers} = vi.hoisted(() => ({
    moveRecipes$: vi.fn(), offerMoveUndo: vi.fn(), pickers: []
}))

vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/connect', () => ({connect: () => Component => Component}))
vi.mock('~/widget/activation/activatable', () => ({withActivatable: () => Component => Component}))
// The real panel renders through a portal that this isolated test has no root for.
vi.mock('~/widget/panel/panel', () => {
    const Pass = ({children}) => <div>{children}</div>
    const Panel = Object.assign(Pass, {
        Header: () => null,
        Content: Pass,
        Buttons: Object.assign(Pass, {
            Main: Pass,
            Cancel: () => null,
            Confirm: ({label, onClick}) => <button onClick={onClick}>{label}</button>
        })
    })
    return {Panel}
})
vi.mock('./recipe', () => ({moveRecipes$}))
vi.mock('./recipeList/moveNotification', () => ({offerMoveUndo}))
// The picker has its own test; what it is handed and what it hands back is the contract here.
vi.mock('./recipeList/folderPicker', () => ({
    FolderPicker: props => {
        pickers.push(props)
        return null
    }
}))

import {MoveRecipe} from './moveRecipe'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('MoveRecipe', () => {
    it('opens the picker at the folder the recipe is in', () => {
        show()

        expect(lastPicker().folderId).toBe(Y2024.id)
    })

    it('moves the recipe to the folder picked, and closes', () => {
        show()

        moveTo(KENYA.id)

        expect(moveRecipes$).toHaveBeenCalledWith([RECIPE.id], KENYA.id)
        expect(activatable.deactivate).toHaveBeenCalled()
    })

    it('offers a way back to the folder the recipe came from', () => {
        show()
        moveTo(KENYA.id)

        const [message, undo] = offerMoveUndo.mock.calls[0]
        undo()

        expect(message).toBe('process.recipe.move.done')
        expect(moveRecipes$).toHaveBeenLastCalledWith([RECIPE.id], Y2024.id)
    })

    it('moves nothing when the folder picked is the one it is in', () => {
        show()

        act(() => moveHere().click())

        expect(moveRecipes$).not.toHaveBeenCalled()
        expect(offerMoveUndo).not.toHaveBeenCalled()
        expect(activatable.deactivate).toHaveBeenCalled()
    })
})

const KENYA = {id: 'kenya', name: 'Kenya', parentId: null}
const Y2024 = {id: '2024', name: '2024', parentId: 'kenya'}
const RECIPE = {id: 'r1', type: 'MOSAIC', folderId: Y2024.id}

let activatable
let unmount

const show = () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => root.render(<MoveRecipe folders={[KENYA, Y2024]} activatable={activatable}/>))
    unmount = () => {
        act(() => root.unmount())
        container.remove()
    }
}

const lastPicker = () => pickers[pickers.length - 1]

const moveHere = () => [...document.querySelectorAll('button')]
    .find(({textContent}) => textContent === 'process.folder.selectHere')

const moveTo = folderId => {
    act(() => lastPicker().onNavigate(folderId))
    act(() => moveHere().click())
}

beforeEach(() => {
    pickers.length = 0
    moveRecipes$.mockReset().mockImplementation(() => of([]))
    offerMoveUndo.mockReset()
    activatable = {recipe: RECIPE, deactivate: vi.fn()}
})

afterEach(() => {
    unmount && unmount()
})
