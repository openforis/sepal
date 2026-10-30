import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {initStore} from '~/store'
import {EventShield} from '~/widget/eventShield'
import {PortalContainer} from '~/widget/portal'

// A real form over a real store: what the user types, and what the form then hands back or refuses.
vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/widget/tooltip', () => ({Tooltip: ({children}) => children}))
// Cuts an import cycle the form barrel would otherwise enter from the wrong side. Nothing here renders one.
vi.mock('~/widget/form/assetCombo', () => ({FormAssetCombo: () => null}))

const {FolderForm} = await import('./folderForm')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('FolderForm', () => {
    it('applies the name without the spaces around it', async () => {
        await open()
        await type('  Kenya  ')

        await submit()

        expect(applied.map(({name}) => name)).toEqual(['Kenya'])
    })

    it('refuses a name taken beside the folder, whatever its case and the spaces around it', async () => {
        await open({folderNames: ['kenya']})
        await type(' KENYA ')

        await submit()

        expect(applied).toEqual([])
    })
})

let root, container, applied

beforeEach(() => {
    applied = []
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
})

const open = ({folderNames = []} = {}) => {
    const store = createStore((state = {dimensions: {width: 1024, height: 768}}, action) =>
        action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    return act(async () => root.render(
        <Provider store={store}>
            <PortalContainer/>
            <EventShield>
                <FolderForm
                    folder={{id: 'new', name: '', parentId: null}}
                    folderNames={folderNames}
                    onApply={folder => applied.push(folder)}
                    onCancel={() => {}}
                />
            </EventShield>
        </Provider>
    ))
}

// Typing is what the input hears through its own value setter; React ignores a plain assignment.
const type = text => act(async () => {
    const input = document.querySelector('form input')
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, text)
    input.dispatchEvent(new Event('input', {bubbles: true}))
})

const submit = () => act(async () => {
    const form = document.querySelector('form')
    form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', {cancelable: true}))
})
