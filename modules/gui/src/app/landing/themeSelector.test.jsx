import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

// Button is a passthrough that shows the icon and selected state it would render.
vi.mock('~/widget/button', () => ({
    Button: ({icon, disabled, onClick}) => <button data-icon={icon} disabled={disabled} onClick={onClick}/>
}))

import {themeManager} from '~/theme'
import {setLanguage, TranslationProvider} from '~/translate'

import {ThemeSelector} from './themeSelector'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

setLanguage('en')

describe('the landing theme selector', () => {
    let unmount

    beforeEach(() => themeManager.setPreference('dark'))
    afterEach(() => unmount())

    const render = () => {
        const container = document.createElement('div')
        document.body.appendChild(container)
        const root = createRoot(container)
        act(() => root.render(<TranslationProvider><ThemeSelector/></TranslationProvider>))
        unmount = () => {
            act(() => root.unmount())
            container.remove()
        }
        return container
    }

    it('shows the active theme as selected', () => {
        const container = render()

        expect(themeButton(container, 'moon').disabled).toBe(true)
        expect(themeButton(container, 'sun').disabled).toBe(false)
        expect(themeButton(container, 'circle-half-stroke').disabled).toBe(false)
    })

    it('switches the theme and shows the choice as selected', () => {
        const container = render()

        act(() => themeButton(container, 'sun').click())

        expect(themeManager.preference).toBe('light')
        expect(themeButton(container, 'sun').disabled).toBe(true)
        expect(themeButton(container, 'moon').disabled).toBe(false)
    })
})

const themeButton = (container, icon) =>
    container.querySelector(`button[data-icon=${icon}]`)
