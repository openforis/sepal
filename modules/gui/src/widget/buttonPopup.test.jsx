import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('~/connect', () => ({connect: () => Component => Component}))
vi.mock('~/widget/floatingBox', () => ({
    FloatingBox: ({children}) => <div data-testid='floating-box'>{children}</div>
}))
vi.mock('~/widget/tooltip', () => ({Tooltip: ({children}) => children}))

import {ButtonPopup} from './buttonPopup'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('ButtonPopup disabled state', () => {
    let container, root

    const render = disabled => {
        act(() => root.render(
            <ButtonPopup disabled={disabled}>
                <div data-testid='picker'/>
            </ButtonPopup>
        ))
    }

    beforeEach(() => {
        container = document.createElement('div')
        document.body.appendChild(container)
        root = createRoot(container)
    })

    afterEach(() => {
        act(() => root.unmount())
        container.remove()
    })

    it('stays closed when re-enabled after being disabled while open', () => {
        render(false)
        act(() => container.querySelector('button').click())
        expect(container.querySelector('[data-testid="picker"]')).not.toBeNull()

        render(true)
        expect(container.querySelector('[data-testid="picker"]')).toBeNull()

        render(false)
        expect(container.querySelector('[data-testid="picker"]')).toBeNull()
    })
})
