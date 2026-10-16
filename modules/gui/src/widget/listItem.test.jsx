import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

// fromEvent(hammer, '...') binds via on/off, so a test can emit pan events instead of synthesizing pointers.
const {hammerInstances} = vi.hoisted(() => ({hammerInstances: []}))
vi.mock('hammerjs', () => {
    class FakeHammer {
        constructor() {
            this.handlers = {}
            hammerInstances.push(this)
        }

        get() {
            return {set: () => {}}
        }

        // Hammer takes several events in one space-separated name, as ListItem gives them.
        on(events, handler) {
            events.split(' ').forEach(event => (this.handlers[event] = this.handlers[event] || []).push(handler))
        }

        off(events, handler) {
            events.split(' ').forEach(event => this.handlers[event] = (this.handlers[event] || []).filter(h => h !== handler))
        }

        emit(event, data) {
            (this.handlers[event] || []).forEach(handler => handler({type: event, ...data}))
        }
    }
    return {default: FakeHammer}
})
vi.mock('~/widget/portal', () => ({Portal: ({children}) => children}))

import {ListItem} from './listItem'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let mounted

const mount = () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => root.render(<ListItem onDragStart={() => {}}>item</ListItem>))
    let unmounted = false
    const unmount = () => {
        if (!unmounted) {
            unmounted = true
            act(() => root.unmount())
            container.remove()
        }
    }
    mounted.push(unmount)
    return {hammer: hammerInstances.at(-1), unmount}
}

const startDrag = ({hammer}) =>
    act(() => hammer.emit('panstart', {changedPointers: [{pageX: 10, pageY: 10}]}))

const showsDragCursor = () => document.body.className.includes('dragCursor')

beforeEach(() => {
    mounted = []
    hammerInstances.length = 0
})

afterEach(() => {
    mounted.forEach(unmount => unmount())
})

describe('ListItem drag cursor', () => {
    it('keeps the cursor while another item unmounts mid-drag', () => {
        const dragged = mount()
        const other = mount()
        startDrag(dragged)

        other.unmount()

        expect(showsDragCursor()).toBe(true)
    })

    it('resets the cursor when the dragged item unmounts', () => {
        const dragged = mount()
        startDrag(dragged)

        dragged.unmount()

        expect(showsDragCursor()).toBe(false)
    })
})
