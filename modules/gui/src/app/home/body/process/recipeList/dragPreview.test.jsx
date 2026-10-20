import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('~/translate', () => ({
    msg: (key, values) => key.endsWith('.items') ? `${values.count} items` : `Move to ${values.folder}`
}))

import {DEFAULT_PORTAL_CONTAINER_ID} from '~/widget/portal'

import {DragPreview} from './dragPreview'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root
let host

beforeEach(() => {
    container = document.createElement('div')
    container.id = DEFAULT_PORTAL_CONTAINER_ID
    document.body.appendChild(container)
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({width: 240, height: 72})
    vi.stubGlobal('innerWidth', 800)
    vi.stubGlobal('innerHeight', 600)
})

afterEach(() => {
    act(() => root.unmount())
    container.remove()
    host.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

const show = props => {
    act(() => root.render(<DragPreview coords={{x: 100, y: 100}} name='Mosaic' icon='globe' count={1} {...props}/>))
    return container.firstElementChild
}

describe('recipe drag preview', () => {
    it('keeps the badge below and right of the pointer', () => {
        const badge = show()

        expect(badge.style.left).toBe('120px')
        expect(badge.style.top).toBe('120px')
        expect(badge.textContent).toBe('Mosaic')
    })

    it('flips away from the right and bottom edges', () => {
        const badge = show({coords: {x: 780, y: 580}})

        expect(badge.style.left).toBe('520px')
        expect(badge.style.top).toBe('488px')
    })

    it('keeps a badge inside a narrow viewport', () => {
        vi.stubGlobal('innerWidth', 256)
        const badge = show({coords: {x: 120, y: 100}})

        expect(badge.style.left).toBe('8px')
        expect(badge.style.top).toBe('120px')
    })

    it('names the selection and updates the destination without retaining an old target', () => {
        const badge = show({count: 3, destination: 'Kenya'})
        expect(badge.textContent).toBe('3 itemsMove to Kenya')

        show({count: 3, destination: 'Home'})
        expect(badge.textContent).toBe('3 itemsMove to Home')

        show({count: 3})
        expect(badge.textContent).toBe('3 items')
    })
})
