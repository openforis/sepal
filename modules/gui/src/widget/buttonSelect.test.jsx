import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('~/connect', () => ({connect: () => Component => Component}))
vi.mock('~/widget/floatingBox', () => ({FloatingBox: ({children}) => <div className='options'>{children}</div>}))
vi.mock('~/widget/list', () => ({ScrollableList: () => null}))
vi.mock('~/widget/button', () => ({
    Button: ({icon, iconType, size, air, additionalClassName, hint, tooltipDisabled, onClick}) =>
        <button
            onClick={onClick}
            data-icon={icon}
            data-icon-type={iconType}
            data-size={size}
            data-air={air}
            data-class={additionalClassName}
            data-hint={String(hint)}
            data-tooltip-disabled={String(tooltipDisabled)}
        />
}))

import {ButtonSelect} from './buttonSelect'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('ButtonSelect', () => {
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

    // A menu that replaces a plain button has to look like that button, hint bubble included.
    it('gives its button the icon type, size, air, class name, hint and tooltip state it is given', () => {
        act(() => root.render(
            <ButtonSelect
                options={[]}
                icon='google'
                iconType='brands'
                size='large'
                air='less'
                additionalClassName='footer-button'
                hint
                tooltipDisabled
            />
        ))

        expect({...container.querySelector('button').dataset}).toEqual({
            icon: 'google',
            iconType: 'brands',
            size: 'large',
            air: 'less',
            class: 'footer-button',
            hint: 'true',
            tooltipDisabled: 'true'
        })
    })

    // The tooltip would otherwise sit on top of the options it describes.
    it('hides its tooltip while the options are open, and shows it again once they close', () => {
        act(() => root.render(<ButtonSelect options={[]} tooltip='Your profile'/>))
        const button = () => container.querySelector('button')

        act(() => button().click())
        const whileOpen = button().dataset.tooltipDisabled
        act(() => button().click())

        expect(container.querySelector('.options')).toBeNull()
        expect([whileOpen, button().dataset.tooltipDisabled]).toEqual(['true', 'false'])
    })
})
