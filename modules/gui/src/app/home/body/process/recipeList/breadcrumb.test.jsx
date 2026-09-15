import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('~/translate', () => ({msg: key => key}))

// Icon renders a Tooltip, which reads the store; a passthrough keeps the real Icon without one.
vi.mock('~/widget/tooltip', () => ({Tooltip: ({children}) => children}))

import {Breadcrumb} from './breadcrumb'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const KENYA = {id: 'kenya', name: 'Kenya', parentId: null}
const Y2024 = {id: '2024', name: '2024', parentId: 'kenya'}
const projects = [KENYA, Y2024]

let mounted
let container

const mount = props => {
    container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => root.render(<Breadcrumb {...props}/>))
    mounted.push(() => {
        act(() => root.unmount())
        container.remove()
    })
}

const labels = () => [...container.querySelectorAll('button')].map(button => button.textContent)

beforeEach(() => {
    mounted = []
})

afterEach(() => {
    mounted.forEach(unmount => unmount())
})

describe('Breadcrumb', () => {
    it('shows home as the current segment, not a link, when already there', () => {
        mount({projects, folderId: null, onNavigate: () => {}})

        expect(container.textContent).toContain('process.recipeList.root')
        expect(labels()).toEqual([])
    })

    it('offers home as a link once you have left it', () => {
        mount({projects, folderId: 'kenya', onNavigate: () => {}})

        expect(labels()).toEqual(['process.recipeList.root'])
    })

    it('shows every ancestor and the current folder', () => {
        mount({projects, folderId: '2024', onNavigate: () => {}})

        expect(container.textContent).toContain('Kenya')
        expect(container.textContent).toContain('2024')
    })

    it('navigates to an ancestor but not to the current folder', () => {
        const onNavigate = vi.fn()
        mount({projects, folderId: '2024', onNavigate})

        act(() => container.querySelectorAll('button')[0].click())

        expect(onNavigate).toHaveBeenCalledWith(null)
        expect(labels()).not.toContain('2024')
    })

    it('makes the root clickable when the current folder no longer exists', () => {
        const onNavigate = vi.fn()
        mount({projects, folderId: 'deleted', onNavigate})

        expect(labels()).toEqual(['process.recipeList.root'])

        act(() => container.querySelectorAll('button')[0].click())

        expect(onNavigate).toHaveBeenCalledWith(null)
    })
})
