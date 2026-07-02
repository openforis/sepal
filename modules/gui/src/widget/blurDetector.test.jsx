import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {BlurDetector} from './blurDetector'
import {EventShield} from './eventShield'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const SKIP_INITIAL_EVENTS_MS = 100

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const skipInitialEvents = () => sleep(SKIP_INITIAL_EVENTS_MS + 50)

const mousedown = target =>
    target.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, cancelable: true}))

const focus = (target, relatedTarget = null) =>
    target.dispatchEvent(new FocusEvent('focus', {relatedTarget}))

describe('BlurDetector', () => {
    let outside, mounted

    const mount = ({onBlur, children}) => {
        const container = document.createElement('div')
        document.body.appendChild(container)
        const root = createRoot(container)
        act(() => {
            root.render(
                <EventShield>
                    <BlurDetector autoBlurTimeout={0} onBlur={onBlur}>
                        {children}
                    </BlurDetector>
                </EventShield>
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
        return {container, unmount}
    }

    beforeEach(() => {
        mounted = []
        outside = document.createElement('div')
        document.body.appendChild(outside)
    })

    afterEach(() => {
        mounted.forEach(unmount => unmount())
        outside.remove()
    })

    it('calls onBlur on mousedown outside the element', async () => {
        const onBlur = vi.fn()
        mount({onBlur, children: <div/>})
        await skipInitialEvents()
        mousedown(outside)
        expect(onBlur).toHaveBeenCalledTimes(1)
    })

    it('does not call onBlur on mousedown inside the element', async () => {
        const onBlur = vi.fn()
        const {container} = mount({onBlur, children: <div id='inside'/>})
        await skipInitialEvents()
        mousedown(container.querySelector('#inside'))
        expect(onBlur).not.toHaveBeenCalled()
    })

    it('does not call onBlur when the window regains focus (focus event without relatedTarget)', async () => {
        // Simulates switching browser tab and back: the browser restores focus to the
        // previously focused element (or document) with relatedTarget null
        const onBlur = vi.fn()
        mount({onBlur, children: <div/>})
        await skipInitialEvents()
        focus(outside, null)
        expect(onBlur).not.toHaveBeenCalled()
    })

    it('calls onBlur when focus moves outside the element (focus event with relatedTarget)', async () => {
        const onBlur = vi.fn()
        const {container} = mount({onBlur, children: <div id='inside'/>})
        await skipInitialEvents()
        focus(outside, container.querySelector('#inside'))
        expect(onBlur).toHaveBeenCalledTimes(1)
    })

    it('does not call onBlur on a covered detector when interacting inside a later-mounted one', async () => {
        // Simulates a modal on top of another modal, mounted as React siblings
        const bottomOnBlur = vi.fn()
        const topOnBlur = vi.fn()
        mount({onBlur: bottomOnBlur, children: <div/>})
        await skipInitialEvents()
        const {container: topContainer} = mount({onBlur: topOnBlur, children: <div id='topInside'/>})
        await skipInitialEvents()
        mousedown(topContainer.querySelector('#topInside'))
        expect(bottomOnBlur).not.toHaveBeenCalled()
        expect(topOnBlur).not.toHaveBeenCalled()
    })

    it('calls onBlur only on the top-most detector on mousedown outside all detectors', async () => {
        const bottomOnBlur = vi.fn()
        const topOnBlur = vi.fn()
        mount({onBlur: bottomOnBlur, children: <div/>})
        await skipInitialEvents()
        mount({onBlur: topOnBlur, children: <div/>})
        await skipInitialEvents()
        mousedown(outside)
        expect(bottomOnBlur).not.toHaveBeenCalled()
        expect(topOnBlur).toHaveBeenCalledTimes(1)
    })

    it('reactivates a covered detector when the top one unmounts', async () => {
        const bottomOnBlur = vi.fn()
        mount({onBlur: bottomOnBlur, children: <div/>})
        await skipInitialEvents()
        const {unmount: unmountTop} = mount({onBlur: vi.fn(), children: <div/>})
        await skipInitialEvents()
        unmountTop()
        mousedown(outside)
        expect(bottomOnBlur).toHaveBeenCalledTimes(1)
    })
})
