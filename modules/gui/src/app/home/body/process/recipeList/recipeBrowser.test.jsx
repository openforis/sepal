import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/widget/tooltip', () => ({Tooltip: ({children}) => children}))
vi.mock('../recipeTypeRegistry', () => ({getRecipeTypeName: type => type}))
// The real panel renders through a portal that this isolated test has no root for.
vi.mock('~/widget/panel/panel', () => {
    const Pass = ({children}) => <div>{children}</div>
    const Panel = Object.assign(Pass, {
        Header: () => null,
        Content: Pass,
        Buttons: Object.assign(Pass, {
            Main: Pass,
            Cancel: ({onClick}) => <button data-cancel onClick={onClick}>cancel</button>
        })
    })
    return {Panel}
})
vi.mock('~/widget/searchBox', () => ({
    SearchBox: ({onSearchValue}) => <input data-search onChange={event => onSearchValue(event.target.value)}/>
}))
vi.mock('~/widget/fastList', () => ({
    FastList: ({items, itemKey, itemRenderer}) =>
        items.map(item => <div key={itemKey(item)}>{itemRenderer(item, false)}</div>)
}))
vi.mock('~/widget/listItem', () => ({
    ListItem: ({children, onClick}) => <div data-row onClick={onClick}>{children}</div>
}))
vi.mock('~/widget/crudItem', () => ({
    CrudItem: ({description, metadata}) => <><div data-name>{description}</div><div data-type>{metadata}</div></>
}))

import {RecipeBrowser} from './recipeBrowser'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('RecipeBrowser', () => {
    it('opens at the folder it is given', () => {
        mount({folderId: KENYA.id})

        expect(rowNames()).toEqual(['Kenya_2024', 'kenya_draft'])
    })

    it('opens at Home when it is given no folder', () => {
        mount()

        expect(rowNames()).toEqual(['Kenya', 'Mozambique', 'loose_draft'])
    })

    it('opens the folder that was clicked', () => {
        mount()

        act(() => rowNamed('Kenya').click())

        expect(rowNames()).toEqual(['Kenya_2024', 'kenya_draft'])
    })

    it('names the type of each recipe beside it, and of no folder', () => {
        mount({folderId: KENYA.id})

        expect(rowTypes()).toEqual(['', 'MOSAIC'])
    })

    it('picks the recipe that was clicked', () => {
        const onSelect = vi.fn()
        mount({folderId: KENYA.id, onSelect})

        act(() => rowNamed('kenya_draft').click())

        expect(onSelect).toHaveBeenCalledWith(IN_KENYA.id)
    })

    it('finds a recipe below the open folder by its name, and names the folder holding it', () => {
        mount()

        search('nairobi')

        expect(rowNames()).toEqual(['Kenya / Kenya_2024 / nairobi_mosaic'])
    })

    it('can be left without picking anything', () => {
        const onCancel = vi.fn()
        mount({onCancel})

        act(() => container.querySelector('[data-cancel]').click())

        expect(onCancel).toHaveBeenCalled()
    })
})

const KENYA = {id: 'kenya', name: 'Kenya', parentId: null}
const MOZAMBIQUE = {id: 'mozambique', name: 'Mozambique', parentId: null}
const Y2024 = {id: '2024', name: 'Kenya_2024', parentId: 'kenya'}
const folders = [KENYA, MOZAMBIQUE, Y2024]

const AT_ROOT = {id: 'r1', name: 'loose_draft', type: 'MOSAIC', folderId: null, updateTime: '2026-01-01'}
const IN_KENYA = {id: 'r2', name: 'kenya_draft', type: 'MOSAIC', folderId: 'kenya', updateTime: '2026-01-02'}
const IN_2024 = {id: 'r3', name: 'nairobi_mosaic', type: 'MOSAIC', folderId: '2024', updateTime: '2026-01-03'}
const recipes = [AT_ROOT, IN_KENYA, IN_2024]

let mounted
let container

const mount = props => {
    container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => root.render(
        <RecipeBrowser folders={folders} recipes={recipes} onSelect={() => {}} onCancel={() => {}} {...props}/>
    ))
    mounted.push(() => {
        act(() => root.unmount())
        container.remove()
    })
}

const rowNames = () => [...container.querySelectorAll('[data-name]')].map(row => row.textContent)

const rowTypes = () => [...container.querySelectorAll('[data-type]')].map(row => row.textContent)

const rowNamed = name => [...container.querySelectorAll('[data-row]')]
    .find(row => row.querySelector('[data-name]').textContent === name)

const search = value => act(() => {
    const input = container.querySelector('[data-search]')
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value)
    input.dispatchEvent(new Event('input', {bubbles: true}))
})

beforeEach(() => {
    mounted = []
})

afterEach(() => {
    mounted.forEach(unmount => unmount())
})
