import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

// Capture what ScrubControl hands to the shared Tooltip (a passthrough avoids the real Tooltip's store deps).
const {tooltipProps} = vi.hoisted(() => ({tooltipProps: []}))
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, placement, children}) => {
        tooltipProps.push({msg, placement})
        return children
    }
}))
const tooltipMsgs = () => tooltipProps.map(({msg}) => msg)

import {ScrubControl} from './scrubControl'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
// Let the preview stream's animationFrames() sampler tick.
const frame = () => sleep(30)

const pointerEvent = (type, {clientY = 0, pointerId = 1, button = 0} = {}) => {
    const e = new Event(type, {bubbles: true, cancelable: true})
    e.clientY = clientY
    e.pointerId = pointerId
    e.button = button
    return e
}

describe('ScrubControl', () => {
    let mounted

    const mount = (props = {}) => {
        const container = document.createElement('div')
        document.body.appendChild(container)
        const root = createRoot(container)
        const onChange = vi.fn()
        const onPreview = vi.fn()
        act(() => {
            root.render(<ScrubControl value={0.5} tooltip='scrub' onChange={onChange} onPreview={onPreview} {...props}/>)
        })
        const button = container.querySelector('button')
        let unmounted = false
        const unmount = () => {
            if (!unmounted) {
                unmounted = true
                act(() => root.unmount())
                container.remove()
            }
        }
        mounted.push(unmount)
        return {button, container, onChange, onPreview, unmount}
    }

    beforeEach(() => {
        mounted = []
    })

    afterEach(() => {
        mounted.forEach(unmount => unmount())
    })

    const down = (button, clientY) => act(() => button.dispatchEvent(pointerEvent('pointerdown', {clientY})))
    const move = (button, clientY) => act(() => button.dispatchEvent(pointerEvent('pointermove', {clientY})))
    const up = button => act(() => button.dispatchEvent(pointerEvent('pointerup')))
    const cancel = button => act(() => button.dispatchEvent(pointerEvent('pointercancel')))
    const lostCapture = button => act(() => button.dispatchEvent(pointerEvent('lostpointercapture')))
    const keydown = (button, key) => act(() => button.dispatchEvent(new KeyboardEvent('keydown', {key, bubbles: true, cancelable: true})))

    it('previews the live value while dragging without committing', async () => {
        const {button, onChange, onPreview} = mount({value: 0.5})
        down(button, 100)
        move(button, 80) // up 20px -> +0.2
        await frame()
        expect(onPreview).toHaveBeenCalled()
        expect(onPreview.mock.calls.at(-1)[0]).toBeCloseTo(0.7)
        expect(onChange).not.toHaveBeenCalled()
    })

    it('commits exactly once with the final value on pointer up', async () => {
        const {button, onChange} = mount({value: 0.5})
        down(button, 100)
        move(button, 80)
        await frame()
        up(button)
        expect(onChange).toHaveBeenCalledTimes(1)
        expect(onChange.mock.calls[0][0]).toBeCloseTo(0.7)
    })

    it('reverts the preview and does not commit on pointer cancel', async () => {
        const {button, onChange, onPreview} = mount({value: 0.5})
        down(button, 100)
        move(button, 70)
        await frame()
        onPreview.mockClear()
        cancel(button)
        expect(onPreview).toHaveBeenCalledTimes(1)
        expect(onPreview.mock.calls[0][0]).toBe(0.5)
        expect(onChange).not.toHaveBeenCalled()
    })

    it('reverts the preview and does not commit on lost pointer capture', async () => {
        const {button, onChange, onPreview} = mount({value: 0.5})
        down(button, 100)
        move(button, 70)
        await frame()
        onPreview.mockClear()
        lostCapture(button)
        expect(onPreview).toHaveBeenCalledTimes(1)
        expect(onPreview.mock.calls[0][0]).toBe(0.5)
        expect(onChange).not.toHaveBeenCalled()
    })

    it('reverts the preview and does not commit when unmounted mid-drag', async () => {
        const {button, onChange, onPreview, unmount} = mount({value: 0.5})
        down(button, 100)
        move(button, 70)
        await frame()
        onPreview.mockClear()
        unmount()
        expect(onPreview).toHaveBeenCalledTimes(1)
        expect(onPreview.mock.calls[0][0]).toBe(0.5)
        expect(onChange).not.toHaveBeenCalled()
    })

    it('toggles endpoints (min<->max) on a press with no movement', () => {
        const {button, onChange, onPreview} = mount({value: 0.5})
        down(button, 100)
        up(button)
        expect(onChange).toHaveBeenCalledTimes(1)
        expect(onChange.mock.calls[0][0]).toBe(0) // 0.5 -> min (default toggle)
        expect(onPreview).not.toHaveBeenCalled()
    })

    it('does not activate a clickable parent', () => {
        const {button, container} = mount()
        const onParentClick = vi.fn()
        const parent = container.parentElement
        parent.addEventListener('click', onParentClick)

        act(() => button.dispatchEvent(new MouseEvent('click', {bubbles: true})))
        parent.removeEventListener('click', onParentClick)

        expect(onParentClick).not.toHaveBeenCalled()
    })

    it('toggles min -> max on Enter and commits once', () => {
        const {button, onChange} = mount({value: 0})
        keydown(button, 'Enter')
        expect(onChange).toHaveBeenCalledTimes(1)
        expect(onChange.mock.calls[0][0]).toBe(1)
    })

    it('toggles down to min on Space and commits once', () => {
        const {button, onChange} = mount({value: 1})
        keydown(button, ' ')
        expect(onChange).toHaveBeenCalledTimes(1)
        expect(onChange.mock.calls[0][0]).toBe(0)
    })

    it('uses a custom toggleValue when provided (opacity strict 0/1)', () => {
        const toggleValue = vi.fn(value => value <= 0 ? 1 : 0)
        const {button, onChange} = mount({value: 0.5, toggleValue})
        keydown(button, 'Enter')
        expect(toggleValue).toHaveBeenCalledWith(0.5)
        expect(onChange).toHaveBeenCalledWith(0)
    })

    it('renders the formatted value, sets an accessible label, and feeds the shared tooltip the live value', () => {
        tooltipProps.length = 0
        const tooltip = vi.fn(value => `v=${value}`)
        const {button} = mount({value: 0.5, formatValue: value => Math.round(value * 100), tooltip})
        expect(button.textContent).toBe('50')
        // No native title tooltip; accessible label instead, and the shared Tooltip gets the same string.
        expect(button.getAttribute('title')).toBeNull()
        expect(button.getAttribute('aria-label')).toBe('v=0.5')
        expect(tooltip).toHaveBeenCalledWith(0.5)
        expect(tooltipMsgs()).toContain('v=0.5')
    })

    it('forwards tooltipPlacement to the shared tooltip (default top)', () => {
        tooltipProps.length = 0
        mount({value: 0.5, tooltip: 'tip'})
        expect(tooltipProps.at(-1).placement).toBe('top')
        tooltipProps.length = 0
        mount({value: 0.5, tooltip: 'tip', tooltipPlacement: 'left'})
        expect(tooltipProps.at(-1).placement).toBe('left')
    })

    it('supports a custom min/max range for the displayed value', () => {
        const {button} = mount({value: 5, min: 0, max: 10, formatValue: value => `${value}`})
        expect(button.textContent).toBe('5')
    })

    // Labels shows a scrubber for row symmetry only: its layer has no opacity control, so the element has
    // to be genuinely inert rather than merely ignored.
    describe('disabled', () => {
        it('does not preview or commit through a pointer drag', async () => {
            const {button, onChange, onPreview} = mount({value: 0.5, disabled: true})

            down(button, 100)
            move(button, 80)
            await frame()
            up(button)

            expect(onPreview).not.toHaveBeenCalled()
            expect(onChange).not.toHaveBeenCalled()
        })

        it('does not commit through the keyboard', () => {
            const {button, onChange} = mount({value: 0, disabled: true})

            keydown(button, 'Enter')
            keydown(button, ' ')

            expect(onChange).not.toHaveBeenCalled()
        })
    })
})
