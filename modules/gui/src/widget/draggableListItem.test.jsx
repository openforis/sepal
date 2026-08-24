import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

// Fake Hammer manager: fromEvent(hammer, '...') binds via on/off, so tests can
// emit pan events deterministically instead of synthesizing pointer events.
const {hammerInstances} = vi.hoisted(() => ({hammerInstances: []}))
vi.mock('hammerjs', () => {
    class FakeHammer {
        constructor(element) {
            this.element = element
            this.handlers = {}
            hammerInstances.push(this)
        }

        get() {
            return {set: () => {}}
        }

        on(event, handler) {
            (this.handlers[event] = this.handlers[event] || []).push(handler)
        }

        off(event, handler) {
            this.handlers[event] = (this.handlers[event] || []).filter(h => h !== handler)
        }

        emit(event, data) {
            (this.handlers[event] || []).forEach(handler => handler(data))
        }
    }
    FakeHammer.DIRECTION_ALL = 30
    return {default: FakeHammer}
})

// The drag clone renders through Portal/Keybinding, which need a portal container
// and the store — passthroughs keep the test on the drag state machine itself.
vi.mock('~/widget/portal', () => ({
    Portal: ({children}) => children
}))
const {keymaps} = vi.hoisted(() => ({keymaps: []}))
vi.mock('~/widget/keybinding', () => ({
    Keybinding: ({keymap, children}) => {
        keymaps.push(keymap)
        return children
    }
}))

import {DraggableListItem} from './draggableListItem'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

describe('DraggableListItem', () => {
    let mounted

    const mount = (props = {}) => {
        const container = document.createElement('div')
        document.body.appendChild(container)
        const root = createRoot(container)
        const drag$ = new Subject()
        const emissions = []
        drag$.subscribe(emission => emissions.push(emission))
        act(() => {
            root.render(
                <DraggableListItem
                    drag$={drag$}
                    dragValue='me'
                    itemRenderer={() => <div>item</div>}
                    item={{}}
                    index={0}
                    {...props}
                />
            )
        })
        let unmounted = false
        const unmount = () => {
            if (!unmounted) {
                unmounted = true
                act(() => root.unmount())
                container.remove()
            }
        }
        mounted.push(unmount)
        const hammer = hammerInstances.at(-1)
        return {container, drag$, emissions, hammer, unmount}
    }

    beforeEach(() => {
        mounted = []
        hammerInstances.length = 0
    })

    afterEach(() => {
        mounted.forEach(unmount => unmount())
    })

    const panStart = hammer => act(() =>
        hammer.emit('panstart', {changedPointers: [{pageX: 10, pageY: 10}]})
    )

    it('emits dragEnd when the pan ends', () => {
        const {hammer, emissions} = mount()
        panStart(hammer)
        expect(emissions.some(({value, dragStart}) => value === 'me' && dragStart)).toBe(true)
        act(() => hammer.emit('panend', {}))
        expect(emissions.some(({value, dragEnd}) => value === 'me' && dragEnd)).toBe(true)
    })

    it('ends the drag when panend arrives before the drag-start state has committed', () => {
        const {container, hammer, emissions} = mount()
        // a quick grab-and-release delivers panstart and panend within the same frame,
        // before React flushes the dragging:true update — both inside one act() models that
        act(() => {
            hammer.emit('panstart', {changedPointers: [{pageX: 10, pageY: 10}]})
            hammer.emit('panend', {})
        })
        expect(emissions.some(({value, dragEnd}) => value === 'me' && dragEnd)).toBe(true)
        expect(container.querySelectorAll('[class*=clone]').length).toBe(0)
    })

    it('ignores a panend without a preceding recognized panstart', () => {
        const {hammer, emissions} = mount()
        act(() => hammer.emit('panend', {}))
        expect(emissions.length).toBe(0)
    })

    it('stops emitting dragMove once the pan has ended', async () => {
        const {hammer, emissions} = mount()
        panStart(hammer)
        await act(() => sleep(50)) // let the move pipeline's animationFrames sampler start
        act(() => hammer.emit('panend', {}))
        const movesAtEnd = emissions.filter(({dragMove}) => dragMove).length
        act(() => hammer.emit('panmove', {center: {x: 100, y: 100}}))
        await act(() => sleep(50)) // outlive the move pipeline's debounce
        expect(emissions.filter(({dragMove}) => dragMove).length).toBe(movesAtEnd)
    })

    it('swallows the eventual panend of an Escape-cancelled drag', () => {
        const {hammer, emissions} = mount()
        panStart(hammer)
        act(() => keymaps.at(-1).Escape()) // the drag clone's Escape keybinding
        expect(emissions.some(({value, dragCancel}) => value === 'me' && dragCancel)).toBe(true)
        act(() => hammer.emit('panend', {}))
        expect(emissions.some(({dragEnd}) => dragEnd)).toBe(false)
    })

    // this item's rect is [0..100] x [0..20]; the other dragged item is the same size
    const mountAsTarget = (props = {}) => {
        const all = mount(props)
        const draggable = all.container.querySelector('div')
        vi.spyOn(draggable, 'getBoundingClientRect').mockReturnValue({x: 0, y: 0, width: 100, height: 20})
        act(() => all.drag$.next({value: 'other', dragStart: {size: {width: 100, height: 20}}}))
        return all
    }

    const otherDragMove = (drag$, {coords, position}) =>
        act(() => drag$.next({value: 'other', dragMove: {coords, position}}))

    const dragOvers = emissions =>
        emissions.filter(({dragOver}) => dragOver?.srcValue === 'other').length

    it('triggers dragOver on clone overlap beyond 50%, regardless of pointer position', () => {
        const {drag$, emissions} = mountAsTarget()
        // pointer well inside the target, but the clone overlaps only 40% — no swap
        otherDragMove(drag$, {coords: {x: 50, y: 10}, position: {x: -60, y: 0}})
        expect(dragOvers(emissions)).toBe(0)
        // pointer far away, but the clone overlaps 60% — swap
        otherDragMove(drag$, {coords: {x: 999, y: 999}, position: {x: -40, y: 0}})
        expect(dragOvers(emissions)).toBe(1)
        // overlap drops back below 50% — dragOut
        otherDragMove(drag$, {coords: {x: 999, y: 999}, position: {x: -60, y: 0}})
        expect(emissions.some(({dragOut}) => dragOut?.srcValue === 'other')).toBe(true)
    })
})
