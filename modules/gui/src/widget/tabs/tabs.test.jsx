import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {initStore, select} from '~/store'
import {EventShield} from '~/widget/eventShield'

vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({children}) => children
}))
vi.mock('~/widget/scrollable', () => ({
    Scrollable: ({children}) => <div>{children}</div>,
    withScrollable: () => Component =>
        function WithScrollableStub(props) {
            return <Component {...props} scrollable={{scrollElement: () => {}}}/>
        }
}))
vi.mock('~/translate', () => ({msg: key => key}))

const {Tabs} = await import('./tabs')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const TAB = {id: 'tab-1', title: 'My tab', placeholder: 'New tab'}

let root, container

afterEach(() => {
    act(() => root?.unmount())
    root = null
    container?.remove()
})

describe('Tabs title', () => {
    it('renames the selected tab and reports the renamed tab to the section', async () => {
        const onTitleChanged = vi.fn()
        const title = 'Renamed'
        mountTabs({onTitleChanged})
        const input = titleInput()

        act(() => input.click())
        act(() => typeInto(input, title))
        act(() => input.blur())

        expect(select('section.tabs.0.title')).toBe(title)
        await act(() => vi.waitFor(() =>
            expect(onTitleChanged).toHaveBeenCalledWith(expect.objectContaining({id: TAB.id, title}))
        ))
    })

    it('keeps the selected tab\'s title read-only when the section opts out of renaming', () => {
        mountTabs({readOnlyTitles: true})
        const input = titleInput()

        act(() => input.click())

        expect(input.readOnly).toBe(true)
    })
})

const mountTabs = props => {
    const store = createStore(
        (state = {dimensions: {width: 1024, height: 768}, section: {tabs: [TAB], selectedTabId: TAB.id}}, action) =>
            action.reduce ? action.reduce(state) : state
    )
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => root.render(
        <Provider store={store}>
            <EventShield>
                <Tabs label='Section' statePath='section' {...props}>
                    {() => null}
                </Tabs>
            </EventShield>
        </Provider>
    ))
}

const titleInput = () =>
    container.querySelector('input')

const typeInto = (input, value) => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setValue.call(input, value)
    input.dispatchEvent(new Event('input', {bubbles: true}))
}
