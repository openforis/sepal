import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('~/translate', () => ({msg: key => key}))
// The breadcrumb's home Icon renders a Tooltip, which reads the store; a passthrough avoids one.
vi.mock('~/widget/tooltip', () => ({Tooltip: ({children}) => children}))
vi.mock('~/widget/crudItem', () => ({CrudItem: ({title}) => title}))
vi.mock('~/widget/listItem', () => ({
    ListItem: ({onClick, children}) => <div className='option' onClick={onClick}>{children}</div>
}))

import {FolderPicker} from './folderPicker'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const A = {id: 'a', name: 'A', parentId: null}
const B = {id: 'b', name: 'B', parentId: null}
const C = {id: 'c', name: 'C', parentId: 'a'}
const projects = [A, B, C]

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
        .find(el => el.textContent === 'process.project.selectHere')
    button.click()
})

beforeEach(() => {
    mounted = []
})

afterEach(() => {
    mounted.forEach(unmount => unmount())
})

describe('FolderPicker', () => {
    // A candidate is excluded when it is `excludeFolderId` itself or lies below it, never the other
    // way around - swapping isSelfOrDescendant's arguments would instead hide an ancestor of
    // excludeFolderId, which is what this pins.
    it('does not exclude an ancestor from the destination list', () => {
        mount({projects, excludeFolderId: 'c', onSelect: () => {}})

        expect(names()).toEqual(['A', 'B'])
    })

    it('excludes a folder from being offered as its own destination', () => {
        mount({projects, excludeFolderId: 'c', onSelect: () => {}})

        clickOption('A')

        expect(names()).toEqual([])
        expect(container.textContent).toContain('process.projects.noProjects')
    })

    it('selects the root when nothing has been navigated into', () => {
        const onSelect = vi.fn()
        mount({projects, onSelect})

        clickSelectHere()

        expect(onSelect).toHaveBeenCalledWith(null)
    })

    it('selects the folder that was navigated into', () => {
        const onSelect = vi.fn()
        mount({projects, onSelect})

        clickOption('A')
        clickSelectHere()

        expect(onSelect).toHaveBeenCalledWith('a')
    })
})
