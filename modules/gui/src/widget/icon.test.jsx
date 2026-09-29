import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, describe, expect, it, vi} from 'vitest'

vi.mock('~/widget/tooltip', () => ({Tooltip: ({children}) => children}))

import {Icon} from './icon'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('Icon', () => {
    let unmount

    const render = props => {
        const container = document.createElement('div')
        document.body.appendChild(container)
        const root = createRoot(container)
        act(() => root.render(<Icon name='check' {...props}/>))
        unmount = () => {
            act(() => root.unmount())
            container.remove()
        }
        return container.querySelector('svg').classList
    }

    afterEach(() => unmount?.())

    it('is as wide as its own glyph', () => {
        expect(render()).toContain('fa-width-auto')
    })

    it('takes a fixed width when asked to', () => {
        const classes = render({attributes: {fixedWidth: true}})
        expect(classes).toContain('fa-fw')
        expect(classes).not.toContain('fa-width-auto')
    })
})
