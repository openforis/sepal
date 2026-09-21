import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const {crudItems, dispatched, listItems, notifications, removeFolder$, updateFolder, warnings} = vi.hoisted(() => ({
    crudItems: [], dispatched: [], listItems: [], notifications: [], removeFolder$: vi.fn(), updateFolder: vi.fn(), warnings: []
}))

vi.mock('~/connect', () => ({connect: () => Component => Component}))
vi.mock('~/store', () => ({select: () => undefined}))
vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/widget/tooltip', () => ({Tooltip: ({children}) => children}))
vi.mock('~/widget/keybinding', () => ({Keybinding: ({children}) => children}))
vi.mock('../createRecipe', () => ({CreateRecipe: () => null}))
vi.mock('../recipeTypeRegistry', () => ({
    getRecipeType: type => ({labels: {name: type}}),
    listRecipeTypes: () => []
}))
// The folder form and the confirmation list pull in the whole form stack, which this test never uses.
vi.mock('./folderForm', () => ({FolderForm: () => null}))
vi.mock('./folderActions', () => ({updateFolder}))
vi.mock('./recipeListConfirm', () => ({RecipeListConfirm: () => null}))
vi.mock('../recipe', () => ({loadFolders$: () => ({}), loadRecipes$: () => ({})}))
vi.mock('~/apiRegistry', () => ({default: {folder: {remove$: removeFolder$}}}))
vi.mock('~/widget/searchBox', () => ({
    SearchBox: ({onSearchValue}) => <input data-search onChange={event => onSearchValue(event.target.value)}/>
}))
vi.mock('~/widget/fastList', () => ({
    FastList: ({items, itemKey, itemRenderer}) =>
        items.map(item => <div key={itemKey(item)}>{itemRenderer(item, false)}</div>)
}))
vi.mock('~/widget/listItem', () => ({
    ListItem: ({children, drag$, dragValue, onClick}) => {
        listItems.push({drag$, dragValue})
        return <div data-row onClick={onClick}>{children}</div>
    }
}))
vi.mock('~/widget/crudItem', () => ({
    CrudItem: props => {
        crudItems.push(props)
        return <div data-title>{props.title}</div>
    }
}))
// The real dialog renders through a portal that this isolated test has no root for.
vi.mock('~/widget/confirm', () => ({
    Confirm: ({children, disabled, onConfirm}) =>
        <div>
            {children}
            <button data-confirm disabled={disabled} onClick={onConfirm}>confirm</button>
        </div>
}))
vi.mock('~/widget/notifications', () => ({
    Notifications: {
        info: notification => notifications.push(notification),
        warning: message => warnings.push(message),
        error: message => warnings.push(message)
    }
}))
vi.mock('~/action-builder', () => ({
    actionBuilder: type => {
        const action = {type, changes: []}
        const builder = {
            set: (path, value) => (action.changes.push(['set', String(path), value]), builder),
            del: path => (action.changes.push(['del', String(path)]), builder),
            dispatch: () => dispatched.push(action)
        }
        return builder
    }
}))

import {RecipeList} from './recipeList'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const KENYA = {id: 'kenya', name: 'Kenya', parentId: null}
const MOZAMBIQUE = {id: 'mozambique', name: 'Mozambique', parentId: null}
const Y2024 = {id: '2024', name: 'Kenya_2024', parentId: 'kenya'}
const MOSAICS = {id: 'mosaics', name: 'Mosaics_2024', parentId: '2024'}
const EMPTY = {id: 'empty', name: 'Empty', parentId: 'kenya'}
const folders = [KENYA, MOZAMBIQUE, Y2024, EMPTY, MOSAICS]

const AT_ROOT = {id: 'r1', name: 'kenya_draft', type: 'MOSAIC', folderId: null, updateTime: '2026-01-01'}
const ALSO_AT_ROOT = {id: 'r3', name: 'mosaic_draft', type: 'CCDC', folderId: null, updateTime: '2026-01-03'}
const IN_2024 = {id: 'r2', name: 'nairobi_mosaic', type: 'TIME_SERIES', folderId: '2024', updateTime: '2026-01-02'}
const recipes = [AT_ROOT, ALSO_AT_ROOT, IN_2024]

let container
let mounted

const mount = (props = {}) => {
    container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => root.render(
        <RecipeList
            folders={folders}
            recipes={recipes}
            folderId={null}
            filterValue=''
            filterValues={[]}
            selectedIds={[]}
            stream={() => ({active: false})}
            onClick={() => {}}
            onMove={() => {}}
            onRemove={() => {}}
            {...props}
        />
    ))
    mounted.push(() => {
        act(() => root.unmount())
        container.remove()
    })
}

const rowTitles = () => [...container.querySelectorAll('[data-title]')].map(row => row.textContent)

const rowFor = title => crudItems.find(props => props.title === title)

// A dialog renders through a portal, outside the container this test mounted into.
const confirm = () => act(() => document.querySelector('[data-confirm]').click())

const button = label => [...document.querySelectorAll('button')].find(({textContent}) => textContent.includes(label))

// The notification renders its own card through content(dismiss); the element carries the handler.
const undoLastMove = () => {
    const dismiss = vi.fn()
    const card = notifications[notifications.length - 1].content(dismiss)
    act(() => card.props.onUndo())
    return dismiss
}

beforeEach(() => {
    mounted = []
    crudItems.length = 0
    dispatched.length = 0
    listItems.length = 0
    warnings.length = 0
    notifications.length = 0
    removeFolder$.mockReset()
    updateFolder.mockReset()
})

afterEach(() => {
    mounted.forEach(unmount => unmount())
})

describe('RecipeList', () => {
    it('shows the folders and the recipes of the open folder, folders first', () => {
        mount()

        expect(rowTitles()).toEqual(['Kenya', 'Mozambique', 'CCDC', 'MOSAIC'])
    })

    it('shows the contents of the folder it was told to open', () => {
        mount({folderId: '2024'})

        expect(rowTitles()).toEqual(['Mosaics_2024', 'TIME_SERIES'])
    })

    it('opens the folder that was clicked, and clears the search', () => {
        mount()

        act(() => container.querySelectorAll('[data-row]')[0].click())

        const navigation = dispatched.find(({type}) => type === 'NAVIGATE_TO_FOLDER')
        expect(navigation.changes).toContainEqual(['set', 'process.folderId', 'kenya'])
        expect(navigation.changes).toContainEqual(['set', 'process.filterValue', ''])
    })

    it('finds a recipe of a subfolder by its name, and names the folder holding it', () => {
        mount({filterValue: 'nairobi', filterValues: ['nairobi']})

        expect(rowTitles()).toEqual(['TIME_SERIES'])
        expect(rowFor('TIME_SERIES').description).toBe('Kenya / Kenya_2024 / nairobi_mosaic')
    })

    it('refuses to remove a folder that still holds something, and asks the server nothing', () => {
        mount()

        act(() => rowFor('Kenya').onRemove())

        expect(warnings).toHaveLength(1)
        expect(removeFolder$).not.toHaveBeenCalled()
    })

    it('removes an empty folder', () => {
        mount({folderId: 'kenya'})

        act(() => rowFor('Empty').onRemove())

        expect(warnings).toEqual([])
        expect(removeFolder$).toHaveBeenCalledWith(EMPTY.id)
    })
})

describe('edit mode', () => {
    const editMode = () => act(() => button('process.recipe.edit.label').click())

    const selectedIds = () => {
        const selection = dispatched.filter(({type}) => type === 'SET_SELECTED_IDS').pop()
        return selection ? selection.changes[0][2] : []
    }

    it('selects a folder instead of opening it', () => {
        mount()

        editMode()
        act(() => container.querySelectorAll('[data-row]')[0].click())

        expect(selectedIds()).toEqual([KENYA.id])
        expect(dispatched.some(({type}) => type === 'NAVIGATE_TO_FOLDER')).toBe(false)
    })

    it('opens the folder again once edit mode is off', () => {
        mount()

        act(() => container.querySelectorAll('[data-row]')[0].click())

        expect(dispatched.some(({type}) => type === 'NAVIGATE_TO_FOLDER')).toBe(true)
    })

    it('ends edit mode once the selection has been removed', () => {
        const onRemove = vi.fn()
        mount({onRemove, selectedIds: [AT_ROOT.id]})

        editMode()
        act(() => button('process.recipe.remove.label').click())
        confirm()

        expect(onRemove).toHaveBeenCalledWith([AT_ROOT.id])
        expect(button('process.recipe.remove.label')).toBeUndefined()
    })

    it('removes the recipes but leaves a folder that still holds something', () => {
        const onRemove = vi.fn()
        mount({onRemove, selectedIds: [KENYA.id, AT_ROOT.id]})

        editMode()
        act(() => button('process.recipe.remove.label').click())
        confirm()

        expect(onRemove).toHaveBeenCalledWith([AT_ROOT.id])
        expect(removeFolder$).not.toHaveBeenCalled()
    })

    it('removes an empty folder of the selection', () => {
        mount({selectedIds: [EMPTY.id], folderId: KENYA.id})

        editMode()
        act(() => button('process.recipe.remove.label').click())
        confirm()

        expect(removeFolder$).toHaveBeenCalledWith(EMPTY.id)
    })

    it('selects the folders and the recipes together', () => {
        mount()

        editMode()
        act(() => button('process.recipe.select.label').click())

        expect(selectedIds().sort()).toEqual([KENYA.id, MOZAMBIQUE.id, AT_ROOT.id, ALSO_AT_ROOT.id].sort())
    })
})

describe('drag and drop', () => {
    const drop = (draggedId, target) => {
        const row = listItems.find(({dragValue}) => dragValue?.id === draggedId)
        vi.spyOn(document, 'elementFromPoint').mockReturnValue(target)
        act(() => row.drag$.next({dragging: true, value: row.dragValue, coords: {x: 1, y: 1}}))
        act(() => row.drag$.next({coords: {x: 2, y: 2}}))
        act(() => row.drag$.next({dragging: false}))
    }

    const dropTarget = folderId => container.querySelector(`[data-drop-folder-id="${folderId}"]`)

    it('moves a recipe into the folder it is dropped on', () => {
        const onMove = vi.fn()
        mount({onMove})

        drop(AT_ROOT.id, dropTarget(KENYA.id))

        expect(onMove).toHaveBeenCalledWith([AT_ROOT.id], KENYA.id)
    })

    it('moves nothing when the drop is outside every target', () => {
        const onMove = vi.fn()
        mount({onMove})

        drop(AT_ROOT.id, container)

        expect(onMove).not.toHaveBeenCalled()
    })

    it('moves a folder to the root when it is dropped on home', () => {
        mount({folderId: KENYA.id})

        drop(Y2024.id, container.querySelector('[data-drop-home]'))

        expect(updateFolder).toHaveBeenCalledWith(expect.objectContaining({id: Y2024.id, parentId: null}))
    })

    it('moves no folder into one of its own subfolders', () => {
        mount({filterValue: '2024', filterValues: ['2024']})

        drop(Y2024.id, dropTarget(MOSAICS.id))

        expect(updateFolder).not.toHaveBeenCalled()
    })

    it('moves every selected recipe when one of them is dragged', () => {
        const onMove = vi.fn()
        mount({onMove, selectedIds: [AT_ROOT.id, ALSO_AT_ROOT.id]})

        drop(AT_ROOT.id, dropTarget(KENYA.id))

        const [movedIds, folderId] = onMove.mock.calls[0]
        expect([...movedIds].sort()).toEqual([AT_ROOT.id, ALSO_AT_ROOT.id].sort())
        expect(folderId).toBe(KENYA.id)
    })

    it('moves only the dragged recipe when it is not one of the selected', () => {
        const onMove = vi.fn()
        mount({onMove, selectedIds: [ALSO_AT_ROOT.id]})

        drop(AT_ROOT.id, dropTarget(KENYA.id))

        expect(onMove).toHaveBeenCalledWith([AT_ROOT.id], KENYA.id)
    })

    it('offers an undo that puts the recipe back where it was', () => {
        const onMove = vi.fn()
        mount({onMove})

        drop(AT_ROOT.id, dropTarget(KENYA.id))
        const dismiss = undoLastMove()

        expect(onMove.mock.calls).toEqual([[[AT_ROOT.id], KENYA.id], [[AT_ROOT.id], null]])
        expect(dismiss).toHaveBeenCalled()
    })

    it('puts each recipe back in its own folder', () => {
        const onMove = vi.fn()
        // A search reaches into the subfolders, so one move can take recipes out of several folders.
        mount({onMove, filterValue: 'mosaic', filterValues: ['mosaic'], selectedIds: [ALSO_AT_ROOT.id, IN_2024.id]})

        drop(ALSO_AT_ROOT.id, dropTarget(MOSAICS.id))
        undoLastMove()

        const undoCalls = onMove.mock.calls.slice(1)
        expect(undoCalls).toContainEqual([[ALSO_AT_ROOT.id], null])
        expect(undoCalls).toContainEqual([[IN_2024.id], Y2024.id])
    })

    it('offers an undo that puts a folder back under its parent', () => {
        mount({folderId: KENYA.id})

        drop(Y2024.id, container.querySelector('[data-drop-home]'))
        undoLastMove()

        expect(updateFolder).toHaveBeenLastCalledWith(expect.objectContaining({id: Y2024.id, parentId: KENYA.id}))
    })

    it('says nothing when a drop moves nothing', () => {
        mount()

        drop(AT_ROOT.id, container)

        expect(notifications).toEqual([])
    })

    it('moves every selected folder and recipe when one of them is dragged', () => {
        const onMove = vi.fn()
        mount({onMove, selectedIds: [KENYA.id, AT_ROOT.id]})

        drop(KENYA.id, dropTarget(MOZAMBIQUE.id))

        expect(onMove).toHaveBeenCalledWith([AT_ROOT.id], MOZAMBIQUE.id)
        expect(updateFolder).toHaveBeenCalledWith(expect.objectContaining({id: KENYA.id, parentId: MOZAMBIQUE.id}))
    })

    it('puts a folder and a recipe back together', () => {
        const onMove = vi.fn()
        mount({onMove, selectedIds: [KENYA.id, AT_ROOT.id]})

        drop(KENYA.id, dropTarget(MOZAMBIQUE.id))
        undoLastMove()

        expect(onMove).toHaveBeenLastCalledWith([AT_ROOT.id], null)
        expect(updateFolder).toHaveBeenLastCalledWith(expect.objectContaining({id: KENYA.id, parentId: null}))
    })

    it('refuses a destination that lies inside a folder the selection holds', () => {
        const onMove = vi.fn()
        // A search shows Kenya, the folder inside it, and a recipe, so all three can take part at once.
        mount({onMove, selectedIds: [KENYA.id, AT_ROOT.id], filterValue: 'kenya', filterValues: ['kenya']})

        drop(AT_ROOT.id, dropTarget(Y2024.id))

        expect(onMove).not.toHaveBeenCalled()
        expect(updateFolder).not.toHaveBeenCalled()
    })

    it('ends edit mode once the selection has been moved', () => {
        mount({selectedIds: [AT_ROOT.id]})
        act(() => button('process.recipe.edit.label').click())

        drop(AT_ROOT.id, dropTarget(KENYA.id))

        expect(button('process.recipe.move.label')).toBeUndefined()
    })

    it('stays in edit mode when the dragged row was not selected', () => {
        mount({selectedIds: [ALSO_AT_ROOT.id]})
        act(() => button('process.recipe.edit.label').click())

        drop(AT_ROOT.id, dropTarget(KENYA.id))

        expect(button('process.recipe.move.label')).toBeDefined()
    })

    it('can drag in edit mode as well', () => {
        mount()

        act(() => button('process.recipe.edit.label').click())

        expect(listItems.some(({drag$, dragValue}) => drag$ && dragValue?.kind === 'recipe')).toBe(true)
    })
})
