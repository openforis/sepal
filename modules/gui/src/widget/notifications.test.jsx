import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/eventPublisher', () => ({publishError: () => {}}))

const clipboard = vi.hoisted(() => ({copied: []}))
vi.mock('~/clipboard', () => ({
    copyToClipboard: value => {
        clipboard.copied.push(value)
        return Promise.resolve(true)
    }
}))

import {initStore} from '~/store'

import {EventShield} from './eventShield'
import {Notifications} from './notifications'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root, container

describe('publishing with an id already on screen', () => {
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

describe('copying an error notification', () => {
    it('copies its title, message lines and error, and leaves it on screen', async () => {
        act(() => Notifications.error({message: 'Saving failed|Try again', error: 'HTTP 500', timeout: 0}))

        await act(() => copyButton().click())

        expect(clipboard.copied).toEqual(['widget.notification.error.title\nSaving failed\nTry again\nHTTP 500'])
        expect(container.querySelector('[class*="removing"]')).toBeNull()
    })

    it('copies the message of an error object', async () => {
        act(() => Notifications.warning({message: 'Partial result', error: new Error('Quota exceeded'), timeout: 0}))

        await act(() => copyButton().click())

        expect(clipboard.copied).toEqual(['widget.notification.warning.title\nPartial result\nQuota exceeded'])
    })

    it('is not offered on a notification without an error', () => {
        act(() => Notifications.info({message: 'Saved', timeout: 0}))

        expect(copyButton()).toBeNull()
    })
})

const shownMessages = () =>
    [...container.querySelectorAll('[class*="messageLine"]')].map(({textContent}) => textContent)

const copyButton = () =>
    container.querySelector('button')

beforeEach(() => {
    clipboard.copied = []
    const store = createStore((state = {dimensions: {width: 1000, height: 1000}}, action) => action.reduce ? action.reduce(state) : state)
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
