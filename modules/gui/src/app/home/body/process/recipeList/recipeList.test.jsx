import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const {crudItems, dispatched, listItems, removeFolder$, warnings} = vi.hoisted(() => ({
    crudItems: [], dispatched: [], listItems: [], removeFolder$: vi.fn(), warnings: []
}))

vi.mock('~/connect', () => ({connect: () => Component => Component}))
vi.mock('~/store', () => ({select: () => undefined}))
vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/widget/tooltip', () => ({Tooltip: ({children}) => children}))
vi.mock('~/widget/keybinding', () => ({Keybinding: ({children}) => children}))
vi.mock('../createRecipe', () => ({CreateRecipe: () => null}))
// The folder form and the confirmation list pull in the whole form stack, which this test never uses.
vi.mock('./folderForm', () => ({FolderForm: () => null}))
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
vi.mock('~/widget/notifications', () => ({
    Notifications: {warning: message => warnings.push(message), error: message => warnings.push(message)}
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
const Y2024 = {id: '2024', name: '2024', parentId: 'kenya'}
const EMPTY = {id: 'empty', name: 'Empty', parentId: 'kenya'}
const folders = [KENYA, Y2024, EMPTY]

const AT_ROOT = {id: 'r1', name: 'loose_draft', type: 'MOSAIC', folderId: null, updateTime: '2026-01-01'}
const IN_2024 = {id: 'r2', name: 'nairobi_mosaic', type: 'MOSAIC', folderId: '2024', updateTime: '2026-01-02'}
const recipes = [AT_ROOT, IN_2024]

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

beforeEach(() => {
    mounted = []
    crudItems.length = 0
    dispatched.length = 0
    listItems.length = 0
    warnings.length = 0
    removeFolder$.mockReset()
})

afterEach(() => {
    mounted.forEach(unmount => unmount())
})

describe('RecipeList', () => {
    it('shows the folders and the recipes of the open folder, folders first', () => {
        mount()

        expect(rowTitles()).toEqual(['Kenya', 'loose_draft'])
    })

    it('shows the contents of the folder it was told to open', () => {
        mount({folderId: '2024'})

        expect(rowTitles()).toEqual(['nairobi_mosaic'])
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

        expect(rowTitles()).toEqual(['nairobi_mosaic'])
        expect(rowFor('nairobi_mosaic').description).toContain('2024')
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
