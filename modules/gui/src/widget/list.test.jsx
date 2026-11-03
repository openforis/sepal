import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('~/widget/elementResizeDetector', () => ({ElementResizeDetector: ({children}) => children}))
vi.mock('~/widget/keybinding', () => ({Keybinding: ({children}) => children}))
vi.mock('~/widget/scrollable', async () => {
    const {NEVER} = await import('rxjs')
    const scrollable = {clientHeight: 0, mouseAway$: NEVER, centerElement: () => {}, scrollElement: () => {}}
    return {Scrollable: ({children}) => <div>{children(scrollable)}</div>}
})
vi.mock('~/widget/button', () => ({
    Button: ({label, icon, iconType, disabled, tooltip}) =>
        <div className='option' data-icon={icon} data-icon-type={iconType} data-disabled={disabled}>
            {label}{tooltip ? <div className='tooltip'>{tooltip}</div> : null}
        </div>
}))

import {ScrollableList} from './list'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('ScrollableList', () => {
    let container, root

    beforeEach(() => {
        container = document.createElement('div')
        document.body.appendChild(container)
        root = createRoot(container)
    })

    afterEach(() => {
        act(() => root.unmount())
        container.remove()
    })

    it('shows each option with its icon, whether selectable or not', () => {
        act(() => root.render(
            <ScrollableList
                options={[
                    {value: 'details', label: 'Details', icon: 'user'},
                    {value: 'google', label: 'Google', icon: 'google', iconType: 'brands', disabled: true}
                ]}
                onSelect={() => {}}
            />
        ))

        const options = [...container.querySelectorAll('.option')].map(({textContent, dataset}) =>
            ({label: textContent, disabled: dataset.disabled === 'true', icon: dataset.icon, iconType: dataset.iconType}))
        expect(options).toEqual([
            {label: 'Details', disabled: false, icon: 'user', iconType: undefined},
            {label: 'Google', disabled: true, icon: 'google', iconType: 'brands'}
        ])
    })

    it('shows an option holding its own control in a popup', () => {
        const Popup = () => <span className='control'/>
        act(() => root.render(
            <ScrollableList
                options={[{key: 'language', label: 'Language', icon: 'language', popup: Popup}]}
                onSelect={() => {}}
            />
        ))

        const option = container.querySelector('.option')
        expect([option.textContent, option.dataset.icon]).toEqual(['Language', 'language'])
        expect(option.querySelector('.tooltip .control')).not.toBeNull()
    })
})
