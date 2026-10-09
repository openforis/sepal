import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('~/translate', () => ({msg: key => key}))
// The back button renders a Tooltip, which reads the store; a passthrough keeps the button without one.
vi.mock('~/widget/tooltip', () => ({Tooltip: ({children}) => children}))
vi.mock('~/widget/crudItem', () => ({
    CrudItem: ({title, titleTooltip}) => <span data-tooltip={titleTooltip}>{title}</span>
}))
// The real scrollable carries a Keybinding, which reads a store this isolated test has none of.
vi.mock('~/widget/scrollable', () => ({Scrollable: ({children}) => children}))
vi.mock('~/widget/listItem', () => ({
    ListItem: ({onClick, children}) => <div className='option' onClick={onClick}>{children}</div>
}))

import {FolderPicker} from './folderPicker'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const A = {id: 'a', name: 'A', parentId: null}
const B = {id: 'b', name: 'B', parentId: null}
const C = {id: 'c', name: 'C', parentId: 'a'}
const folders = [A, B, C]

let mounted
let container

const mount = props => {
    container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => root.render(<FolderPicker {...props}/>))
    mounted.push(() => {
        act(() => root.unmount())
        container.remove()
    })
}

const names = () => [...container.querySelectorAll('.option')].map(el => el.textContent)

const clickOption = name => act(() => {
    const option = [...container.querySelectorAll('.option')].find(el => el.textContent === name)
    option.click()
})

const clickSelectHere = () => act(() => {
    const button = [...container.querySelectorAll('button')]
        .find(el => el.textContent === 'process.folder.selectHere')
    button.click()
})

// The way back up is the only button here that carries an icon instead of a label.
const backButton = () => [...container.querySelectorAll('button')].find(el => !el.textContent.trim())

const clickBack = () => act(() => backButton().click())

// The folder the picker is in is named beside the way back out of it.
const currentFolder = () => backButton().nextElementSibling.textContent

beforeEach(() => {
    mounted = []
})

afterEach(() => {
    mounted.forEach(unmount => unmount())
})

describe('FolderPicker', () => {
    it('lists the root folders first', () => {
        mount({folders, onSelect: () => {}})

        expect(names()).toEqual(['A', 'B'])
    })

    it('selects the root when nothing has been navigated into', () => {
        const onSelect = vi.fn()
        mount({folders, onSelect})

        clickSelectHere()

        expect(onSelect).toHaveBeenCalledWith(null)
    })

    it('names the folder it is in, and home at the root', () => {
        mount({folders, onSelect: () => {}})

        expect(currentFolder()).toBe('process.recipeList.root')

        clickOption('A')

        expect(currentFolder()).toBe('A')
    })

    it('offers the whole name of a folder, which a row may be too narrow to show', () => {
        mount({folders, onSelect: () => {}})

        const tooltips = [...container.querySelectorAll('[data-tooltip]')].map(el => el.dataset.tooltip)

        expect(tooltips).toEqual(['A', 'B'])
    })

    it('goes back to the folder above', () => {
        mount({folders, onSelect: () => {}})

        clickOption('A')
        expect(names()).toEqual(['C'])

        clickBack()

        expect(names()).toEqual(['A', 'B'])
    })

    it('offers no way up from the root', () => {
        mount({folders, onSelect: () => {}})

        expect(backButton().disabled).toBe(true)
    })

    it('selects the folder that was navigated into', () => {
        const onSelect = vi.fn()
        mount({folders, onSelect})

        clickOption('A')
        clickSelectHere()

        expect(onSelect).toHaveBeenCalledWith('a')
    })
})
