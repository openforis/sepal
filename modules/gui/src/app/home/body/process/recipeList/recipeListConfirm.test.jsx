import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

const {crudItems} = vi.hoisted(() => ({crudItems: []}))

vi.mock('~/connect', () => ({connect: () => Component => Component}))
vi.mock('~/store', () => ({select: () => undefined}))
vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/widget/listItem', () => ({ListItem: ({children}) => children}))
vi.mock('~/widget/crudItem', () => ({
    CrudItem: props => {
        crudItems.push(props)
        return null
    }
}))
vi.mock('../recipeTypeRegistry', () => ({
    getRecipeType: type => ({labels: {name: `${type} recipe`}})
}))

import {RecipeListConfirm} from './recipeListConfirm'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const KENYA = {id: 'kenya', name: 'Kenya', parentId: null}
const Y2024 = {id: '2024', name: '2024', parentId: 'kenya'}
const folders = [KENYA, Y2024]

const IN_2024 = {id: 'r1', name: 'nairobi_mosaic', type: 'MOSAIC', folderId: '2024', updateTime: '2026-01-02'}
const AT_ROOT = {id: 'r2', name: 'loose_draft', type: 'MOSAIC', folderId: null, updateTime: '2026-01-01'}

const recipeItem = recipe => ({kind: 'recipe', id: recipe.id, recipe})
const folderItem = folder => ({kind: 'folder', id: folder.id, folder})

let mounted

const mount = props => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => root.render(<RecipeListConfirm folders={folders} recipes={[IN_2024, AT_ROOT]} {...props}/>))
    mounted.push(() => {
        act(() => root.unmount())
        container.remove()
    })
}

const itemFor = title => crudItems.find(props => props.title === title)

const folderRow = () => itemFor('process.folder.title')

beforeEach(() => {
    mounted = []
    crudItems.length = 0
})

afterEach(() => {
    mounted.forEach(unmount => unmount())
})

describe('RecipeListConfirm', () => {
    it('names the type, and gives the whole path down to the recipe', () => {
        mount({items: [recipeItem(IN_2024)]})

        expect(itemFor('MOSAIC recipe').description).toBe('Kenya / 2024 / nairobi_mosaic')
    })

    it('calls the root Home for a recipe that is in no folder', () => {
        mount({items: [recipeItem(AT_ROOT)]})

        expect(itemFor('MOSAIC recipe').description).toBe('process.recipeList.root / loose_draft')
    })

    it('shows a folder with what it holds', () => {
        mount({items: [folderItem(KENYA)]})

        expect(folderRow().description).toBe('Kenya')
        expect(folderRow().metadata).toContain('process.folder.folderCount')
    })

    it('marks a folder that cannot take part, and offers it no choice', () => {
        mount({items: [folderItem(KENYA)], disabledIds: [KENYA.id], onSelect: () => {}})

        expect(folderRow().description).toBe('Kenya · process.folder.remove.stays')
        expect(folderRow().selected).toBe(false)
        expect(folderRow().onSelect).toBeUndefined()
    })

    it('lets a row that can take part be chosen', () => {
        const onSelect = vi.fn()
        mount({items: [recipeItem(AT_ROOT)], isSelected: () => true, onSelect})

        itemFor('MOSAIC recipe').onSelect()

        expect(itemFor('MOSAIC recipe').selected).toBe(true)
        expect(onSelect).toHaveBeenCalledWith(AT_ROOT.id)
    })
})
