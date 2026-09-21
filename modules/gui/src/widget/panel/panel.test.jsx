// A notification sits above every modal, and acting on it — an Update button in a warning, say —
// must not count as a click on the modal's backdrop.

import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/eventPublisher', () => ({publishError: () => {}}))

import {initStore} from '~/store'

import {EventShield} from '../eventShield'
import {Notifications} from '../notifications'
import {DEFAULT_PORTAL_CONTAINER_ID, PortalContainer} from '../portal'
import {Panel} from './panel'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const SKIP_INITIAL_EVENTS_MS = 100

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const mousedown = target =>
    target.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, cancelable: true}))

describe('a modal panel', () => {
    let mounted

    const mountModal = onBackdropClick => {
        const container = document.createElement('div')
        document.body.appendChild(container)
        const root = createRoot(container)
        const store = createStore((state = {}, action) => action.reduce ? action.reduce(state) : state)
        initStore(store)
        act(() => root.render(
            <Provider store={store}>
                <EventShield>
                    <PortalContainer id={DEFAULT_PORTAL_CONTAINER_ID}/>
                    <Notifications/>
                    <Panel placement='modal' onBackdropClick={onBackdropClick}>
                        <div id='panelContent'/>
                    </Panel>
                </EventShield>
            </Provider>
        ))
        mounted.push(() => {
            act(() => root.unmount())
            container.remove()
        })
        return container
    }

    const showNotificationWithButton = async () => {
        act(() => Notifications.warning({
            message: 'changed',
            content: () => <button id='notificationButton'/>,
            timeout: 0
        }))
        await act(() => sleep(SKIP_INITIAL_EVENTS_MS + 50))
        return document.getElementById('notificationButton')
    }

    beforeEach(() => mounted = [])
    afterEach(() => mounted.forEach(unmount => unmount()))

    it('closes on a click outside it', async () => {
        const onBackdropClick = vi.fn()
        mountModal(onBackdropClick)
        await showNotificationWithButton()

        mousedown(document.body)

        expect(onBackdropClick).toHaveBeenCalledTimes(1)
    })

    it('stays open on a click on a notification', async () => {
        const onBackdropClick = vi.fn()
        mountModal(onBackdropClick)
        const notificationButton = await showNotificationWithButton()

        mousedown(notificationButton)

        expect(onBackdropClick).not.toHaveBeenCalled()
    })
})
