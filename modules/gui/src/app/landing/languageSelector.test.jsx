import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

// Button is a passthrough that shows the label and look it would render.
vi.mock('~/widget/button', () => ({
    Button: ({label, look, onClick}) => <button data-look={look} onClick={onClick}>{label}</button>
}))

import {getLanguage, setLanguage, TranslationProvider} from '~/translate'

import {LanguageSelector} from './languageSelector'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('the landing language selector', () => {
    let unmount, reload

    beforeEach(() => {
        setLanguage('en')
        reload = vi.fn()
        vi.stubGlobal('location', {...window.location, reload})
    })
    afterEach(() => {
        unmount()
        vi.unstubAllGlobals()
    })

    const render = () => {
        const container = document.createElement('div')
        document.body.appendChild(container)
        const root = createRoot(container)
        act(() => root.render(<TranslationProvider><LanguageSelector/></TranslationProvider>))
        unmount = () => {
            act(() => root.unmount())
            container.remove()
        }
        return container
    }

    it('highlights the active language', () => {
        const container = render()

        expect(languageButton(container, 'en').dataset.look).toBe('highlight')
        expect(languageButton(container, 'fr').dataset.look).toBe('default')
    })

    it('stores another language and reloads the page to apply it', () => {
        const container = render()

        act(() => languageButton(container, 'es').click())

        expect(getLanguage()).toBe('es')
        expect(reload).toHaveBeenCalled()
    })

    it('does not reload when the active language is chosen again', () => {
        const container = render()

        act(() => languageButton(container, 'en').click())

        expect(reload).not.toHaveBeenCalled()
    })
})

const languageButton = (container, code) =>
    [...container.querySelectorAll('button')].find(button => button.textContent === code)
