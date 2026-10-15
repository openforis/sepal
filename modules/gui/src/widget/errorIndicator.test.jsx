import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {initStore} from '~/store'

import {CrudItem} from './crudItem'
import {ListItem} from './listItem'
import {PortalContainer} from './portal'

// A list item in error, marked beside its title with its explanation, in a row that is clicked to open and dragged.

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

describe.each([
    ['title', {title: 'Image bands'}],
    ['custom content', {content: <span>Forest</span>}],
    ['custom content with removal', {
        content: <span>A long band name repeated to exercise the custom header</span>,
        removeConfirmationLabel: 'Remove',
        onRemove: () => {}
    }]
])('a list item in error: %s', (_name, props) => {
    it('explains its error when its mark is reached from the keyboard', async () => {
        await mount({props})

        await act(async () => mark().focus())

        expect(document.activeElement).toBe(mark())
        expect(document.body.textContent).toContain('Its source no longer has red.')
    })

    it('is neither opened nor dragged by using its mark', async () => {
        const opened = vi.fn()
        const pressed = vi.fn()
        await mount({props, onClick: opened})
        row().addEventListener('pointerdown', pressed)

        await act(async () => {
            mark().dispatchEvent(new Event('pointerdown', {bubbles: true}))
            mark().click()
        })

        expect(pressed).not.toHaveBeenCalled()
        expect(opened).not.toHaveBeenCalled()
    })
})

const mount = async ({props, onClick = () => {}} = {}) => {
    const store = createStore((state = {dimensions: {width: 1024, height: 768}}, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(
        <Provider store={store}>
            <PortalContainer/>
            <ListItem onClick={onClick} drag$={{next: () => {}}}>
                <CrudItem {...props} error='Its source no longer has red.'/>
            </ListItem>
        </Provider>
    ))
}

const mark = () => container.querySelector('[data-feedback="error"]')

// Where the row is pressed to be dragged.
const row = () => mark().closest('[class*="main"]')
