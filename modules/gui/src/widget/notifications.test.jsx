import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/eventPublisher', () => ({publishError: () => {}}))

import {initStore} from '~/store'

import {EventShield} from './eventShield'
import {Notifications} from './notifications'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('publishing with an id already on screen', () => {
    let root, container

    const shownMessages = () =>
        [...container.querySelectorAll('[class*="messageLine"]')].map(({textContent}) => textContent)

    beforeEach(() => {
        const store = createStore((state = {}, action) => action.reduce ? action.reduce(state) : state)
        initStore(store)
        container = document.createElement('div')
        document.body.appendChild(container)
        root = createRoot(container)
        act(() => root.render(
            <Provider store={store}>
                <EventShield>
                    <Notifications/>
                </EventShield>
            </Provider>
        ))
    })

    afterEach(() => {
        act(() => root.unmount())
        container.remove()
    })

    it('updates that notification in place instead of stacking or dropping', () => {
        act(() => Notifications.info({id: 'fixed', message: 'first', timeout: 0}))

        act(() => Notifications.info({id: 'fixed', message: 'second', timeout: 0}))

        expect(shownMessages()).toEqual(['second'])
    })

    it('still shows one notification for repeats of a grouped message', () => {
        act(() => Notifications.error({message: 'boom', group: true, timeout: 0}))

        act(() => Notifications.error({message: 'boom', group: true, timeout: 0}))

        expect(shownMessages()).toEqual(['boom'])
    })
})
