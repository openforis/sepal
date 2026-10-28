import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

// A passthrough that records its message; the real Tooltip reaches the store.
const {tooltips} = vi.hoisted(() => ({tooltips: []}))
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, children}) => {
        tooltips.push(msg)
        return children
    }
}))

import {RelativeTime} from './relativeTime'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const CREATED = new Date('2026-08-17T07:17:29.000Z')
const MINUTE = 60 * 1000

describe('RelativeTime', () => {
    let unmount

    const render = timestamp => {
        const container = document.createElement('div')
        document.body.appendChild(container)
        const root = createRoot(container)
        act(() => root.render(<RelativeTime timestamp={timestamp}/>))
        unmount = () => {
            act(() => root.unmount())
            container.remove()
        }
        return container
    }

    const advance = ms => act(() => vi.advanceTimersByTime(ms))

    beforeEach(() => {
        tooltips.length = 0
        vi.useFakeTimers()
        vi.setSystemTime(CREATED.getTime() + 5 * MINUTE)
    })

    afterEach(() => {
        unmount?.()
        vi.useRealTimers()
    })

    it('shows how long ago the timestamp was', () => {
        expect(render(CREATED.toISOString()).textContent).toBe('5 minutes ago')
    })

    it('keeps the text current as time passes', () => {
        const container = render(CREATED.toISOString())
        advance(MINUTE)
        expect(container.textContent).toBe('6 minutes ago')
        advance(2 * 60 * MINUTE)
        expect(container.textContent).toBe('2 hours ago')
    })

    it('shows the full timestamp in a tooltip', () => {
        render(CREATED.toISOString())
        expect(tooltips.at(-1)).toMatch(/^2026-08-1[67] \d{2}:\d{2}:29$/)
    })
})
