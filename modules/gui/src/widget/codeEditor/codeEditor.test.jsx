import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, describe, expect, it, vi} from 'vitest'

vi.mock('~/widget/keybinding', () => ({Keybinding: ({children}) => children}))
vi.mock('~/widget/icon', () => ({Icon: () => null}))

import {themeManager} from '~/theme'
import {setLanguage, TranslationProvider} from '~/translate'

import {CodeEditor} from './codeEditor'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

setLanguage('en')

describe('CodeEditor', () => {
    afterEach(() => themeManager.setPreference('dark'))

    it('stops touching its input once unmounted, even when the theme changes', () => {
        const input = {value: 'b1 + b2', set: vi.fn(), setInvalid: vi.fn()}
        const unmount = render(input)

        unmount()
        input.set.mockClear()
        input.setInvalid.mockClear()
        themeManager.setPreference('light')

        expect(input.setInvalid).not.toHaveBeenCalled()
        expect(input.set).not.toHaveBeenCalled()
    })
})

const render = input => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => root.render(
        <TranslationProvider>
            <CodeEditor input={input} autoComplete={() => null} lint={() => []}/>
        </TranslationProvider>
    ))
    return () => {
        act(() => root.unmount())
        container.remove()
    }
}
