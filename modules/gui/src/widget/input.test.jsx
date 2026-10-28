import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('~/connect', () => ({connect: () => Component => Component}))
vi.mock('~/widget/tooltip', () => ({Tooltip: ({children}) => children}))

import {Input} from './input'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// The autocomplete attribute is what browsers and password managers read to tell a username field
// from a new-password one, so the token a caller asks for has to reach the DOM verbatim.
describe('Input autocomplete', () => {
    let root
    let container

    const render = props => act(() => root.render(<Input value='' onChange={() => {}} {...props}/>))

    const autocomplete = () => container.querySelector('input').getAttribute('autocomplete')

    beforeEach(() => {
        container = document.createElement('div')
        document.body.appendChild(container)
        root = createRoot(container)
    })

    afterEach(() => {
        act(() => root.unmount())
        container.remove()
    })

    it('is off by default', () => {
        render({})
        expect(autocomplete()).toBe('off')
    })

    it('is on when enabled', () => {
        render({autoComplete: true})
        expect(autocomplete()).toBe('on')
    })

    it('passes a token such as username through verbatim', () => {
        render({autoComplete: 'username'})
        expect(autocomplete()).toBe('username')
    })

    it('passes new-password through verbatim', () => {
        render({autoComplete: 'new-password', type: 'password'})
        expect(autocomplete()).toBe('new-password')
    })
})
