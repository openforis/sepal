import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('~/widget/userAgent', () => ({isMobile: () => true}))

import {Label} from './label'
import {DEFAULT_PORTAL_CONTAINER_ID} from './portal'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('a label on a touch device', () => {
    let unmount

    beforeEach(() => {
        const portal = document.createElement('div')
        portal.id = DEFAULT_PORTAL_CONTAINER_ID
        document.body.appendChild(portal)
    })

    afterEach(() => {
        unmount?.()
        document.getElementById(DEFAULT_PORTAL_CONTAINER_ID).remove()
    })

    const render = props => {
        const container = document.createElement('div')
        document.body.appendChild(container)
        const root = createRoot(container)
        act(() => root.render(<Label msg='Instance' {...props}/>))
        unmount = () => {
            act(() => root.unmount())
            container.remove()
        }
        return container
    }

    it('shows its warning when the warning icon is tapped', () => {
        const container = render({warning: 'Below what this app recommends'})
        expect(document.body.textContent).not.toContain('Below what this app recommends')

        act(() => container.querySelector('[data-feedback="warning"]').dispatchEvent(new MouseEvent('click', {bubbles: true})))

        expect(document.getElementById(DEFAULT_PORTAL_CONTAINER_ID).textContent).toContain('Below what this app recommends')
    })
})
