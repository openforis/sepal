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

const selectHereButton = () => [...container.querySelectorAll('button')]
    .find(el => el.textContent === 'process.folder.selectHere')

const clickSelectHere = () => act(() => selectHereButton().click())

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

    it('opens at the folder it is given', () => {
        mount({folders, folderId: A.id, onSelect: () => {}})

        expect(currentFolder()).toBe('A')
        expect(names()).toEqual(['C'])
    })

    it('shows the root as the breadcrumb does, the house and a chevron a screen reader is given a name for', () => {
        mount({folders, onSelect: () => {}})

        expect([...backButton().nextElementSibling.querySelectorAll('[data-icon]')].map(icon => icon.getAttribute('data-icon')))
            .toEqual(['house', 'chevron-right'])
        expect(backButton().nextElementSibling.getAttribute('aria-label')).toBe('process.recipeList.root')
    })

    it('names the folder it is in', () => {
        mount({folders, onSelect: () => {}})

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

    it('tells where it has gone, as it goes', () => {
        const onNavigate = vi.fn()
        mount({folders, onNavigate})

        clickOption('A')
        clickBack()

        expect(onNavigate.mock.calls).toEqual([['a'], [null]])
    })

    // A dialog around the picker may carry the action in its own buttons.
    it('offers no button of its own without a selection to hand over', () => {
        mount({folders, onNavigate: () => {}})

        expect(selectHereButton()).toBeUndefined()
    })

    it('selects the folder that was navigated into', () => {
        const onSelect = vi.fn()
        mount({folders, onSelect})

        clickOption('A')
        clickSelectHere()

        expect(onSelect).toHaveBeenCalledWith('a')
    })
})
