import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {Subject} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {initStore} from '~/store'

// The tooltip stub shows what it would say instead of the real Tooltip's store deps; scrollable stub
// replaces the Scrollable context the handle uses to scroll itself into view on mount.
vi.mock('~/widget/tooltip', () => ({
    Tooltip: ({msg, children}) => <>{children}{msg ? <span data-tooltip>{msg}</span> : null}</>
}))
vi.mock('~/widget/scrollable', () => ({
    withScrollable: () => Component =>
        function WithScrollableStub(props) {
            return <Component {...props} scrollable={{scrollElement: () => {}}}/>
        }
}))

import {TabHandle} from './tabHandle'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('TabHandle tooltip', () => {
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

    it('gives the tooltip it is handed', () => {
        const container = mount({tooltip: '/ Kenya / My app'})

        expect(container.querySelector('[data-tooltip]').textContent).toBe('/ Kenya / My app')
    })
})
