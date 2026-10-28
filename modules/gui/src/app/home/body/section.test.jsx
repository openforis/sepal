import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {MemoryRouter, useNavigate} from 'react-router'
import {legacy_createStore as createStore} from 'redux'
import {describe, expect, it} from 'vitest'

import {EnabledContext} from '~/enabled'
import {initStore} from '~/store'

import {Section} from './section'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('application section navigation', () => {
    it('makes the outgoing section inert immediately and retains its draft for return', async () => {
        initStore(createStore(() => ({dimensions: {width: 1280, height: 800}})))
        const container = document.createElement('div')
        document.body.appendChild(container)
        const root = createRoot(container)
        try {
            await act(async () => root.render(<MemoryRouter><Harness/></MemoryRouter>))
            const input = container.querySelector('input')
            input.value = 'unapplied'
            const process = section('/')
            expect(process.hasAttribute('inert')).toBe(false)

            await act(async () => container.querySelector('[data-browse]').click())

            expect(input.dataset.enabled).toBe('false')
            expect(process.hasAttribute('inert')).toBe(true)
            expect(section('/-/browse').hasAttribute('inert')).toBe(false)
            expect(container.querySelector('input')).toBe(input)

            await act(async () => container.querySelector('[data-process]').click())

            expect(input.dataset.enabled).toBe('true')
            expect(process.hasAttribute('inert')).toBe(false)
            expect(section('/-/browse').hasAttribute('inert')).toBe(true)
            expect(input.value).toBe('unapplied')
        } finally {
            await act(async () => root.unmount())
            container.remove()
        }
    })
})

const section = path => document.getElementById(`portal_selectable_${path}`).parentElement.parentElement

const Harness = () => {
    const navigate = useNavigate()
    return <>
        <nav>
            <button data-process onClick={() => navigate('/')}>Process</button>
            <button data-browse onClick={() => navigate('/-/browse')}>Browse</button>
        </nav>
        <Section path='/'>
            <EnabledContext.Consumer>{enabled => <input data-enabled={enabled}/>}</EnabledContext.Consumer>
        </Section>
        <Section path='/-/browse'><button>Folder</button></Section>
    </>
}
