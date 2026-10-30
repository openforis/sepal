import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {NEVER, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const {crudItems, dispatched, folderForms, listItems, moveItems, removeFolder$, streamed, updateFolder, warnings} = vi.hoisted(() => ({
    crudItems: [], dispatched: [], folderForms: [], listItems: [], moveItems: vi.fn(), removeFolder$: vi.fn(), streamed: [],
    updateFolder: vi.fn(), warnings: []
}))

vi.mock('~/connect', () => ({connect: () => Component => Component}))
vi.mock('~/store', () => ({select: () => undefined}))
vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/widget/tooltip', () => ({Tooltip: ({children}) => children}))
vi.mock('~/widget/portal', () => ({Portal: ({children}) => children}))
vi.mock('~/widget/keybinding', () => ({Keybinding: ({children}) => children}))
vi.mock('../createRecipe', () => ({CreateRecipe: () => null}))
vi.mock('../recipeTypeRegistry', () => ({
    getRecipeType: type => ({labels: {name: type}}),
    listRecipeTypes: () => []
}))
// The folder form and the confirmation list pull in the whole form stack, which this test never uses.
vi.mock('./folderForm', () => ({
    FolderForm: props => {
        folderForms.push(props)
        return null
    }
}))
vi.mock('./folderActions', () => ({moveItems, updateFolder}))
vi.mock('./recipeListConfirm', () => ({RecipeListConfirm: () => null}))
vi.mock('../recipe', async () => {
    const {NEVER} = await import('rxjs')
    return {loadFolders$: () => NEVER, loadRecipes$: () => NEVER}
})
vi.mock('~/apiRegistry', () => ({default: {folder: {remove$: removeFolder$}}}))
vi.mock('~/widget/searchBox', () => ({
    SearchBox: ({onSearchValue}) => <input data-search onChange={event => onSearchValue(event.target.value)}/>
}))
vi.mock('~/widget/fastList', () => ({
    FastList: ({items, itemKey, itemRenderer}) =>
        items.map(item => <div key={itemKey(item)}>{itemRenderer(item, false)}</div>)
}))
vi.mock('~/widget/listItem', () => ({
    ListItem: ({children, drag$, dragValue, hovered, onClick}) => {
        listItems.push({drag$, dragValue, hovered})
        return <div data-row onClick={onClick}>{children}</div>
    }
}))
vi.mock('~/widget/crudItem', () => ({
    CrudItem: props => {
        crudItems.push(props)
        return <div data-name>{props.description}</div>
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
            stream={runStream}
            onClick={() => {}}
            onRemove={() => {}}
            {...props}
        />
    ))
    mounted.push(() => {
        act(() => root.unmount())
        container.remove()
    })
}

// A folder row and a recipe row both carry their name in the description; only a recipe row has a title.
const rowNames = () => [...container.querySelectorAll('[data-name]')].map(row => row.textContent)

const rowFor = name => crudItems.find(props => props.description === name)

// A dialog renders through a portal, outside the container this test mounted into.
const confirm = () => act(() => document.querySelector('[data-confirm]').click())

const button = label => [...document.querySelectorAll('button')].find(({textContent}) => textContent.includes(label))

// Runs what the list streams, as connect does, and remembers its name.
const runStream = (name, stream$, onNext, onError) => {
    streamed.push(name)
    stream$.subscribe({next: onNext, error: onError})
    return {active: false}
}

// What a move was handed: each item with the folder it comes from, and where they all go.
const lastMove = () => {
    const [items, folderId] = moveItems.mock.lastCall
    return {items: items.map(({kind, id, folderId}) => ({kind, id, from: folderId})), to: folderId}
}

beforeEach(() => {
    mounted = []
    crudItems.length = 0
    folderForms.length = 0
    dispatched.length = 0
    listItems.length = 0
    streamed.length = 0
    warnings.length = 0
    moveItems.mockReset()
    removeFolder$.mockReset().mockReturnValue(NEVER)
    updateFolder.mockReset()
})

afterEach(() => {
    mounted.forEach(unmount => unmount())
})

describe('RecipeList', () => {
    it('shows the folders and the recipes of the open folder, folders first', () => {
        mount()

        expect(rowNames()).toEqual(['Kenya', 'Mozambique', 'mosaic_draft', 'kenya_draft'])
    })

    it('shows the contents of the folder it was told to open', () => {
        mount({folderId: '2024'})

        expect(rowNames()).toEqual(['Mosaics_2024', 'nairobi_mosaic'])
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

        expect(rowNames()).toEqual(['Kenya / Kenya_2024 / nairobi_mosaic'])
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

    // A refusal means this copy of the tree disagrees with the server's.
    it('says what the server found in a folder it refused to remove, and loads the tree again', () => {
        removeFolder$.mockReturnValue(throwError(() => ({response: {code: 'FOLDER_NOT_EMPTY', folders: 0, recipes: 2}})))
        mount({folderId: 'kenya'})

        act(() => rowFor('Empty').onRemove())

        expect(warnings.map(({message}) => message)).toEqual(['process.folder.remove.notEmpty'])
        expect(streamed).toEqual(['REMOVE_FOLDERS', 'LOAD_FOLDERS', 'LOAD_RECIPES'])
    })

    it('reports a removal that failed, and loads the tree again', () => {
        removeFolder$.mockReturnValue(throwError(() => new Error('unavailable')))
        mount({folderId: 'kenya'})

        act(() => rowFor('Empty').onRemove())

        expect(warnings.map(({message}) => message)).toEqual(['process.folder.remove.error'])
        expect(streamed).toEqual(['REMOVE_FOLDERS', 'LOAD_FOLDERS', 'LOAD_RECIPES'])
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

    it('is open to folders when there are no recipes', () => {
        mount({recipes: []})

        editMode()

        expect(button('process.recipe.select.label')).toBeDefined()
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

    it('says which folder of the selection the server refused to remove', () => {
        removeFolder$.mockReturnValue(throwError(() => ({response: {code: 'FOLDER_NOT_EMPTY', folders: 1, recipes: 0}})))
        mount({selectedIds: [EMPTY.id], folderId: KENYA.id})

        editMode()
        act(() => button('process.recipe.remove.label').click())
        confirm()

        expect(warnings.map(({message}) => message)).toEqual(['process.folder.remove.notEmpty'])
        expect(streamed).toContain('LOAD_FOLDERS')
    })

    it('selects the folders and the recipes together', () => {
        mount()

        editMode()
        act(() => button('process.recipe.select.label').click())

        expect(selectedIds().sort()).toEqual([KENYA.id, MOZAMBIQUE.id, AT_ROOT.id, ALSO_AT_ROOT.id].sort())
    })
})

describe('drag and drop', () => {
    // Holding the pointer over the target leaves the rows of that render in listItems, and nothing else.
    const dragOver = (draggedId, target) => {
        const row = listItems.find(({dragValue}) => dragValue?.id === draggedId)
        vi.spyOn(document, 'elementFromPoint').mockReturnValue(target)
        act(() => row.drag$.next({dragging: true, value: row.dragValue, coords: {x: 1, y: 1}}))
        listItems.length = 0
        act(() => row.drag$.next({coords: {x: 2, y: 2}}))
        return row
    }

    const drop = (draggedId, target) => {
        const row = dragOver(draggedId, target)
        act(() => row.drag$.next({dragging: false}))
    }

    const dropTarget = folderId => container.querySelector(`[data-drop-folder-id="${folderId}"]`)

    const hoveredIds = () => listItems.filter(({hovered}) => hovered).map(({dragValue}) => dragValue.id)

    it('hovers the folder the drop would land in, and nothing else', () => {
        mount()

        dragOver(AT_ROOT.id, dropTarget(KENYA.id))

        expect(hoveredIds()).toEqual([KENYA.id])
        expect(container.querySelector('[role="status"]').textContent).toBe('kenya_draftprocess.recipeList.drag.moveTo')
    })

    it('shows one badge for the selection and removes it when the drag ends', () => {
        mount({selectedIds: [AT_ROOT.id, ALSO_AT_ROOT.id]})

        const row = dragOver(AT_ROOT.id, container)

        expect(container.querySelectorAll('[role="status"]')).toHaveLength(1)
        expect(container.querySelector('[role="status"]').textContent).toBe('process.recipeList.drag.items')

        act(() => row.drag$.next({dragging: false}))

        expect(container.querySelector('[role="status"]')).toBeNull()
    })

    it('hovers nothing while the pointer is over what cannot take the drop', () => {
        mount()

        dragOver(AT_ROOT.id, container)

        expect(hoveredIds()).toEqual([])
    })

    it('moves a recipe into the folder it is dropped on', () => {
        mount()

        drop(AT_ROOT.id, dropTarget(KENYA.id))

        expect(lastMove()).toEqual({items: [{kind: 'recipe', id: AT_ROOT.id, from: null}], to: KENYA.id})
    })

    it('moves nothing when the drop is outside every target', () => {
        mount()

        drop(AT_ROOT.id, container)

        expect(moveItems).not.toHaveBeenCalled()
    })

    it('moves a folder to the root when it is dropped on home', () => {
        mount({folderId: KENYA.id})

        drop(Y2024.id, container.querySelector('[data-drop-home]'))

        expect(lastMove()).toEqual({items: [{kind: 'folder', id: Y2024.id, from: KENYA.id}], to: null})
    })

    it('moves no folder into one of its own subfolders', () => {
        mount({filterValue: '2024', filterValues: ['2024']})

        drop(Y2024.id, dropTarget(MOSAICS.id))

        expect(moveItems).not.toHaveBeenCalled()
    })

    it('moves every selected recipe when one of them is dragged', () => {
        mount({selectedIds: [AT_ROOT.id, ALSO_AT_ROOT.id]})

        drop(AT_ROOT.id, dropTarget(KENYA.id))

        const {items, to} = lastMove()
        expect(items.map(({id}) => id).sort()).toEqual([AT_ROOT.id, ALSO_AT_ROOT.id].sort())
        expect(to).toBe(KENYA.id)
    })

    it('moves only the dragged recipe when it is not one of the selected', () => {
        mount({selectedIds: [ALSO_AT_ROOT.id]})

        drop(AT_ROOT.id, dropTarget(KENYA.id))

        expect(lastMove().items.map(({id}) => id)).toEqual([AT_ROOT.id])
    })

    // A search reaches into the subfolders, so one move can take recipes out of several folders, and the
    // way back has to know each one.
    it('tells the move the folder each recipe comes from', () => {
        mount({filterValue: 'mosaic', filterValues: ['mosaic'], selectedIds: [ALSO_AT_ROOT.id, IN_2024.id]})

        drop(ALSO_AT_ROOT.id, dropTarget(MOSAICS.id))

        expect(lastMove().items).toEqual(expect.arrayContaining([
            {kind: 'recipe', id: ALSO_AT_ROOT.id, from: null},
            {kind: 'recipe', id: IN_2024.id, from: Y2024.id}
        ]))
    })

    it('moves every selected folder and recipe when one of them is dragged', () => {
        mount({selectedIds: [KENYA.id, AT_ROOT.id]})

        drop(KENYA.id, dropTarget(MOZAMBIQUE.id))

        expect(lastMove()).toEqual({
            items: expect.arrayContaining([
                {kind: 'folder', id: KENYA.id, from: null},
                {kind: 'recipe', id: AT_ROOT.id, from: null}
            ]),
            to: MOZAMBIQUE.id
        })
    })

    it('refuses a destination that lies inside a folder the selection holds', () => {
        // A search shows Kenya, the folder inside it, and a recipe, so all three can take part at once.
        mount({selectedIds: [KENYA.id, AT_ROOT.id], filterValue: 'kenya', filterValues: ['kenya']})

        drop(AT_ROOT.id, dropTarget(Y2024.id))

        expect(moveItems).not.toHaveBeenCalled()
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

// Folders are told apart by where they are, as files are: only a folder beside it can make a name taken.
describe('naming a folder', () => {
    it('takes a new folder\'s name as taken only by the folders beside it', () => {
        mount({folderId: KENYA.id})

        act(() => button('process.folder.add').click())

        expect(takenNames()).toEqual(['empty', 'kenya_2024'])
    })

    it('takes a name as taken whatever the spaces around it', () => {
        mount({folders: [...folders, {id: 'spaced', name: ' Spaced ', parentId: null}]})

        act(() => button('process.folder.add').click())

        expect(takenNames()).toContain('spaced')
    })

    it('leaves a folder its own name, and checks a new one against the folders beside it', () => {
        mount()

        act(() => rowFor('Kenya').onEdit())

        expect(takenNames()).toEqual(['mozambique'])
    })
})

const takenNames = () => [...folderForms[folderForms.length - 1].folderNames].sort()
