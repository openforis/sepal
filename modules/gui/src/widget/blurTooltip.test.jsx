import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {BlurDetector} from './blurDetector'
import {EventShield} from './eventShield'
import {Tooltip} from './tooltip'

// A tooltip belongs to the panel that owns its trigger, but its popup is rendered into the global portal - far
// outside that panel's BlurDetector subtree. `isOverElement` is pure containment, so every event inside the popup
// reads as "outside the panel": clicking a link in an asset-folder tooltip closes the panel under it, and moving
// the pointer into a tooltip starts the panel's delayed close.
//
// The popup has to count as inside the panel that owns it, and only that panel. RcTooltip hands its popup root to
// `onPopupAlign` before it can be clicked, which is where the registration happens.
//
// RcTooltip is replaced by a stand-in that mounts a popup element outside the detector - as the real portal does -
// and drives the align and visibility callbacks on demand. That keeps real DOM containment, which is all the
// detector reasons about, without portals or hover timers.

const SKIP_INITIAL_EVENTS_MS = 100
const AUTO_BLUR_TIMEOUT_MS = 50

const rc = vi.hoisted(() => ({instances: []}))
const env = vi.hoisted(() => ({mobile: false}))

// isMobile() reads the Redux store, which no store backs here.
vi.mock('~/widget/userAgent', () => ({isMobile: () => env.mobile}))

vi.mock('rc-tooltip', () => ({
    default: ({children, onPopupAlign, afterVisibleChange, ...props}) => {
        const popup = document.createElement('div')
        popup.textContent = 'popup contents'
        rc.instances.push({
            popup,
            props,
            align: () => onPopupAlign && onPopupAlign(popup, {points: ['bc', 'tc']}),
            setVisible: visible => afterVisibleChange && afterVisibleChange(visible)
        })
        return children
    }
}))

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

const mounted = []

const render = element => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => root.render(element))
    mounted.push({root, container})
    return container
}

const unmountAll = () => {
    while (mounted.length) {
        const {root, container} = mounted.pop()
        act(() => root.unmount())
        container.remove()
    }
}

const dispatchMouseDown = target =>
    act(() => {
        target.dispatchEvent(new window.MouseEvent('mousedown', {bubbles: true, cancelable: true}))
    })

const dispatchMouseMove = target =>
    act(() => {
        target.dispatchEvent(new window.MouseEvent('mousemove', {bubbles: true}))
    })

// The popup is mounted where the real one goes: outside the detector, in the document.
const showPopup = instance => {
    document.body.appendChild(instance.popup)
    act(() => instance.align())
    return instance.popup
}

const panel = ({onBlur, tooltip = {}, children}) => {
    const container = render(
        <EventShield>
            <BlurDetector onBlur={onBlur} autoBlurTimeout={AUTO_BLUR_TIMEOUT_MS}>
                <Tooltip msg='Some hint' {...tooltip}>
                    <button>trigger</button>
                </Tooltip>
                {children}
            </BlurDetector>
        </EventShield>
    )
    return {container, tooltip: rc.instances[0]}
}

beforeEach(() => {
    rc.instances = []
    env.mobile = false
})

afterEach(() => {
    unmountAll()
    document.body.innerHTML = ''
})

describe('a tooltip popup owned by a blur detector', () => {
    it('does not blur the owner when it is clicked', async () => {
        const onBlur = vi.fn()
        const {tooltip} = panel({onBlur})
        const popup = showPopup(tooltip)
        await wait(SKIP_INITIAL_EVENTS_MS + 20)

        dispatchMouseDown(popup)

        expect(onBlur).not.toHaveBeenCalled()
    })

    it('does not start the owner delayed close when the pointer moves into it', async () => {
        const onBlur = vi.fn()
        const {container, tooltip} = panel({onBlur})
        const popup = showPopup(tooltip)
        await wait(SKIP_INITIAL_EVENTS_MS + 20)

        dispatchMouseMove(container.querySelector('button'))
        await wait(30) // over$ is throttled at 16ms; a synchronous second move would be dropped
        dispatchMouseMove(popup)
        await wait(AUTO_BLUR_TIMEOUT_MS + 40)

        expect(onBlur).not.toHaveBeenCalled()
    })
})

describe('ownership scoping', () => {
    it('does not adopt a tooltip belonging to something else', async () => {
        const onBlur = vi.fn()
        panel({onBlur})
        render(
            <EventShield>
                <Tooltip msg='Elsewhere'>
                    <button>other trigger</button>
                </Tooltip>
            </EventShield>
        )
        const foreignPopup = showPopup(rc.instances[1])
        await wait(SKIP_INITIAL_EVENTS_MS + 20)

        dispatchMouseDown(foreignPopup)

        expect(onBlur).toHaveBeenCalled()
    })

})

describe('the registration lifetime', () => {
    it('ends when the tooltip hides', async () => {
        const onBlur = vi.fn()
        const {tooltip} = panel({onBlur})
        const popup = showPopup(tooltip)
        await wait(SKIP_INITIAL_EVENTS_MS + 20)

        act(() => tooltip.setVisible(false))
        dispatchMouseDown(popup)

        expect(onBlur).toHaveBeenCalled()
    })

    it('ends when the tooltip unmounts', async () => {
        const onBlur = vi.fn()
        const {tooltip} = panel({onBlur})
        const popup = showPopup(tooltip)
        await wait(SKIP_INITIAL_EVENTS_MS + 20)

        act(() => mounted[0].root.render(
            <EventShield>
                <BlurDetector onBlur={onBlur} autoBlurTimeout={AUTO_BLUR_TIMEOUT_MS}>
                    <button>trigger</button>
                </BlurDetector>
            </EventShield>
        ))
        dispatchMouseDown(popup)

        expect(onBlur).toHaveBeenCalled()
    })
})

describe('caller-supplied tooltip callbacks', () => {
    it('still run', () => {
        const onPopupAlign = vi.fn()
        const afterVisibleChange = vi.fn()
        const {tooltip} = panel({onBlur: () => {}, tooltip: {onPopupAlign, afterVisibleChange}})

        showPopup(tooltip)
        act(() => tooltip.setVisible(false))

        expect(onPopupAlign).toHaveBeenCalledWith(tooltip.popup, {points: ['bc', 'tc']})
        expect(afterVisibleChange).toHaveBeenCalledWith(false)
    })
})
