import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

// Dragging an item, with Hammer replaced by one the test drives: what the item's drag$ is told, and where its preview
// is drawn. The item measures at left 40, top 50; frames and timers are the test's.

const hammers = vi.hoisted(() => [])
vi.mock('hammerjs', () => {
    class Hammer {
        handlers = {}
        destroyed = false

        constructor(element) {
            this.element = element
            hammers.push(this)
        }

        get() {
            return {set: () => {}}
        }

        on(events, handler) {
            events.split(' ').forEach(type => (this.handlers[type] = this.handlers[type] || []).push(handler))
        }

        off(events, handler) {
            events.split(' ').forEach(type => this.handlers[type] = (this.handlers[type] || []).filter(h => h !== handler))
        }

        emit(type, event) {
            (this.handlers[type] || []).forEach(handler => handler({type, ...event}))
        }

        destroy() {
            this.destroyed = true
        }
    }
    Hammer.DIRECTION_HORIZONTAL = 6
    Hammer.DIRECTION_VERTICAL = 24
    Hammer.DIRECTION_ALL = 30
    return {default: Hammer}
})

const {Subject} = await import('rxjs')
const {ListItem, useDragPreview} = await import('./listItem')
const {PortalContainer} = await import('./portal')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container, drag$, told

beforeEach(() => {
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame']})
    hammers.length = 0
    told = []
    drag$ = new Subject()
    drag$.subscribe(event => told.push(event))
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
    vi.useRealTimers()
})

describe('a dragged item', () => {
    it('is held where it was pressed, however far the pointer had moved when the drag was recognised', async () => {
        await mount()

        await pan('panstart', {x: 130, y: 62}, {deltaX: 30, deltaY: 0})
        await pan('panmove', {x: 160, y: 72})
        await nextFrame()

        expect(previewAt()).toEqual({x: 160 - 60 - 1, y: 72 - 12 - 1})
    })

    it('dragged along one axis keeps its place on the other', async () => {
        await mount({dragAxis: 'vertical'})

        await pan('panstart', {x: 130, y: 62}, {deltaX: 30, deltaY: 0})
        await pan('panmove', {x: 160, y: 72})
        await nextFrame()

        expect(previewAt()).toEqual({x: 40 - 1, y: 72 - 12 - 1})
    })

    it('follows the latest position once a frame, and is told where it was released before the drag ends', async () => {
        await mount()
        await pan('panstart', {x: 100, y: 62})

        await pan('panmove', {x: 110, y: 62})
        await pan('panmove', {x: 120, y: 62})
        expect(moves()).toEqual([])
        await nextFrame()
        expect(moves()).toEqual([{x: 120, y: 62}])

        await pan('panmove', {x: 130, y: 62})
        await pan('panend', {x: 140, y: 62})
        await act(async () => vi.advanceTimersByTime(100))

        expect(moves()).toEqual([{x: 120, y: 62}, {x: 140, y: 62}])
        expect(told.at(-1)).toEqual({dragging: false})
    })

    it('leaves no frame or timer pending once the drag ends, nor anything listening once unmounted', async () => {
        await mount()
        await pan('panstart', {x: 100, y: 62})
        await pan('panmove', {x: 110, y: 62})
        await nextFrame()
        await pan('panend', {x: 110, y: 62})
        await act(async () => vi.advanceTimersByTime(100))

        expect(vi.getTimerCount()).toBe(0)

        await act(async () => root.unmount())
        root = null

        expect(hammers[0].destroyed).toBe(true)
    })

    it('ends the drag where a cancelled gesture left it', async () => {
        await mount()
        await pan('panstart', {x: 100, y: 62})

        await pan('pancancel', {x: 115, y: 62})
        await act(async () => vi.advanceTimersByTime(100))

        expect(moves()).toEqual([{x: 115, y: 62}])
        expect(told.at(-1)).toEqual({dragging: false})
    })

    it('shows what is dragged in its preview, keeping the controls it offers on the item itself', async () => {
        await mount()

        await pan('panstart', {x: 100, y: 62})

        expect(container.querySelectorAll('.content [data-control]')).toHaveLength(1)
        expect(preview().querySelectorAll('[data-control]')).toHaveLength(0)
        expect(preview().querySelectorAll('[data-control-slot]')).toHaveLength(1)
    })
})

// Renders a control on the item, and only the room it takes in the item's preview.
const Content = () => {
    const preview = useDragPreview()
    return (
        <div className='content'>
            <span>Item</span>
            <span data-control-slot>{preview ? null : <button data-control>Actions</button>}</span>
        </div>
    )
}

const mount = async props => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(
        <>
            <PortalContainer/>
            <ListItem drag$={drag$} dragValue='item' {...props}>
                <Content/>
            </ListItem>
        </>
    ))
    hammers[0].element.getBoundingClientRect = () => ({left: 40, top: 50, width: 200, height: 30})
}

const pan = (type, center, {deltaX = 0, deltaY = 0} = {}) =>
    act(async () => hammers[0].emit(type, {center, deltaX, deltaY}))

const nextFrame = () => act(async () => vi.advanceTimersToNextFrame())

const moves = () => told.filter(event => !('dragging' in event)).map(({coords}) => coords)

const preview = () => document.querySelector('[class*="draggableClone"]')

const previewAt = () => {
    const {style} = preview()
    return {x: Number(style.getPropertyValue('--x')), y: Number(style.getPropertyValue('--y'))}
}
