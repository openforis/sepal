import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {initStore} from '~/store'

// Passthrough tooltip avoids the real Tooltip's store deps; scrollable stub replaces
// the Scrollable context the handle uses to scroll itself into view on mount.
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({children}) => children
}))
vi.mock('~/widget/scrollable', () => ({
    withScrollable: () => Component =>
        function WithScrollableStub(props) {
            return <Component {...props} scrollable={{scrollElement: () => {}}}/>
        }
}))

import {TabHandle} from './tabHandle'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('TabHandle prefix', () => {
    let mounted

    const store = createStore((state = {}) => state)
    initStore(store)

    const mount = props => {
        const container = document.createElement('div')
        document.body.appendChild(container)
        const root = createRoot(container)
        act(() => root.render(
            <Provider store={store}>
                <TabHandle
                    id='tab-1'
                    statePath='apps'
                    title='My app'
                    tabBusy$={() => new Subject()}
                    {...props}
                />
            </Provider>
        ))
        mounted.push(() => {
            act(() => root.unmount())
            container.remove()
        })
        return container
    }

    beforeEach(() => {
        mounted = []
    })

    afterEach(() => {
        mounted.forEach(unmount => unmount())
    })

    it('renders the prefix before the editable title', () => {
        const container = mount({prefix: '2:'})
        const prefix = container.querySelector('[class*="prefix"]')
        expect(prefix).not.toBe(null)
        expect(prefix.textContent).toBe('2:')
        // the prefix is not part of the editable title
        expect(container.querySelector('input').value).toBe('My app')
    })

    it('renders no prefix element when there is no prefix', () => {
        const container = mount({})
        expect(container.querySelector('[class*="prefix"]')).toBe(null)
    })
})
