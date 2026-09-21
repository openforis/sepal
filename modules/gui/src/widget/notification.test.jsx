import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

// The notification widget is ours; a fake that records what is on screen stands in for it.
const shown = new Map()
vi.mock('./notifications', () => ({
    Notifications: {
        info: ({id, ...notification}) => shown.set(id, {level: 'info', ...notification}),
        warning: ({id, ...notification}) => shown.set(id, {level: 'warning', ...notification}),
        dismiss: id => shown.delete(id)
    }
}))

const {Notification} = await import('./notification')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('a declarative notification', () => {
    let root, container

    const render = props => act(() => root.render(<Notification id='n' {...props}/>))

    beforeEach(() => {
        shown.clear()
        container = document.createElement('div')
        document.body.appendChild(container)
        root = createRoot(container)
    })

    afterEach(() => {
        act(() => root.unmount())
        container.remove()
    })

    it('is on screen while the component is, at its level, for as long as the component lives', () => {
        render({level: 'warning', message: 'changed'})

        expect(shown.get('n')).toMatchObject({level: 'warning', message: 'changed', timeout: 0, dismissable: false})
    })

    it('follows its props', () => {
        render({message: 'first'})

        render({message: 'second'})

        expect(shown.size).toBe(1)
        expect(shown.get('n').message).toBe('second')
    })

    it('passes content through', () => {
        const content = () => null
        render({message: 'm', content})

        expect(shown.get('n').content).toBe(content)
    })

    it('goes when the component does', () => {
        render({message: 'm'})

        act(() => root.render(null))

        expect(shown.size).toBe(0)
    })
})
