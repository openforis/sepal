import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {FloatingButton} from './floatingButton'
import {DEFAULT_PORTAL_CONTAINER_ID, PortalContainer, PortalContext} from './portal'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const CONTEXT_PORTAL_CONTAINER_ID = 'sectionPortalContainer'

describe('FloatingButton', () => {
    let root
    let mountPoint

    const mount = props => act(() => root.render(
        <>
            <PortalContainer/>
            <PortalContext id={CONTEXT_PORTAL_CONTAINER_ID}>
                <PortalContainer id={CONTEXT_PORTAL_CONTAINER_ID}/>
                <div id='caller'>
                    <FloatingButton {...props}/>
                </div>
            </PortalContext>
        </>
    ))

    const globalContainer = () => document.getElementById(DEFAULT_PORTAL_CONTAINER_ID)
    const contextContainer = () => document.getElementById(CONTEXT_PORTAL_CONTAINER_ID)
    const button = () => document.querySelector('button')
    const click = () => act(() => button().dispatchEvent(new MouseEvent('click', {bubbles: true})))

    beforeEach(() => {
        mountPoint = document.createElement('div')
        document.body.appendChild(mountPoint)
        root = createRoot(mountPoint)
    })

    afterEach(() => {
        act(() => root.unmount())
        mountPoint.remove()
    })

    it('renders the button in the enclosing section portal rather than where it is declared', () => {
        mount({label: 'Add'})

        expect(contextContainer().contains(button())).toBe(true)
        expect(document.getElementById('caller').contains(button())).toBe(false)
    })

    it('renders the button in the global portal when asked to', () => {
        mount({label: 'Add', type: 'global'})

        expect(globalContainer().contains(button())).toBe(true)
        expect(contextContainer().contains(button())).toBe(false)
    })

    it('behaves as a Button', () => {
        const onClick = vi.fn()
        mount({label: 'Add', onClick})

        click()

        expect(button().textContent).toBe('Add')
        expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('does not respond while disabled', () => {
        const onClick = vi.fn()
        mount({label: 'Add', onClick, disabled: true})

        click()

        expect(button().disabled).toBe(true)
        expect(onClick).not.toHaveBeenCalled()
    })
})
