import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('~/connect', () => ({connect: () => Component => Component}))

import {EventShield} from './eventShield'
import {FloatingBox} from './floatingBox'
import {DEFAULT_PORTAL_CONTAINER_ID} from './portal'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('FloatingBox positioning', () => {
    let container, portalContainer, root

    beforeEach(() => {
        portalContainer = document.createElement('div')
        portalContainer.id = DEFAULT_PORTAL_CONTAINER_ID
        container = document.createElement('div')
        document.body.append(portalContainer, container)
        root = createRoot(container)
    })

    afterEach(() => {
        act(() => root.unmount())
        container.remove()
        portalContainer.remove()
        vi.restoreAllMocks()
    })

    it('centers the box in the live viewport while stored viewport dimensions lag a resize', () => {
        const element = anchorElement({left: 400, right: 600})
        simulateLayout({element, viewportWidth: 1000, naturalWidth: 300})

        act(() => root.render(
            <EventShield>
                <FloatingBox element={element} hPlacement='center' viewportDimensions={{width: 1200, height: 800}}>
                    <div/>
                </FloatingBox>
            </EventShield>
        ))

        const box = portalContainer.querySelector('[style*="--left"]')
        expect(box.style.getPropertyValue('--left')).toBe('350')
        expect(box.style.getPropertyValue('--right')).toBe('350')
    })
})

const anchorElement = ({left, right}) => {
    const element = document.createElement('div')
    element.getBoundingClientRect = () => ({top: 100, bottom: 120, left, right})
    return element
}

// The box's width follows from CSS: both --left and --right are set for horizontal center,
// so the browser stretches it to fill the space between them in the real viewport.
const simulateLayout = ({element, viewportWidth, naturalWidth}) => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(viewportWidth)
    vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
        if (this === element) {
            return element.getBoundingClientRect()
        }
        const left = parseFloat(this.style.getPropertyValue('--left'))
        const right = parseFloat(this.style.getPropertyValue('--right'))
        const width = isNaN(left) || isNaN(right) ? naturalWidth : viewportWidth - left - right
        return {top: 0, bottom: 200, left: isNaN(left) ? 0 : left, right: (isNaN(left) ? 0 : left) + width}
    })
}
