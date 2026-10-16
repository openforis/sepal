import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {initStore} from '~/store'

import {Keybinding} from './keybinding'
import {SearchBox} from './searchBox'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('Escape in a search box', () => {
    it('clears what was typed, and goes no further', () => {
        const dialogCancel = vi.fn()
        mount({value: 'mosaic', dialogCancel})

        act(() => pressEscape())

        expect(container.querySelector('input').value).toBe('')
        expect(dialogCancel).not.toHaveBeenCalled()
    })

    it('goes on to what else answers to it when there is nothing to clear', () => {
        const dialogCancel = vi.fn()
        mount({value: '', dialogCancel})

        act(() => pressEscape())

        expect(dialogCancel).toHaveBeenCalled()
    })
})

let mounted
let container

// The dialog's Cancel is bound before the box, as a box mounted again inside an open dialog is: the box
// then answers to the key first.
const mount = ({value, dialogCancel}) => {
    const store = createStore((state = {dimensions: {width: 1200, height: 900}}) => state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => root.render(
        <Provider store={store}>
            <Keybinding keymap={{Escape: dialogCancel}}/>
            <SearchBox value={value}/>
        </Provider>
    ))
    mounted.push(() => {
        act(() => root.unmount())
        container.remove()
    })
}

const pressEscape = () =>
    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape'}))

beforeEach(() => {
    mounted = []
})

afterEach(() => {
    mounted.forEach(unmount => unmount())
})
