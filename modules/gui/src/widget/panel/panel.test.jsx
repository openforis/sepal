// A notification sits above every modal, and acting on it — an Update button in a warning, say —
// must not count as a click on the modal's backdrop.

import {act, useContext, useLayoutEffect, useRef} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('~/translate', () => ({msg: key => key}))
vi.mock('~/eventPublisher', () => ({publishError: () => {}}))

import {Enabled, EnabledContext} from '~/enabled'
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

// What a panel's content does on being enabled - a chart drawing itself, which Dygraph sizes by its element - must find the
// panel displayed: it is hidden while what it is in is disabled, and displayed again in the render that enables it.
describe('a panel in what is disabled and enabled again', () => {
    let root, container

    beforeEach(() => {
        initStore(createStore((state = {dimensions: {width: 1024, height: 768}}) => state))
        container = document.createElement('div')
        document.body.appendChild(container)
        root = createRoot(container)
    })
    afterEach(() => {
        act(() => root.unmount())
        container.remove()
    })

    // Whether its panel is hidden, as its content finds it each time it is told it is enabled or disabled.
    const seen = []
    const Content = () => {
        const enabled = useContext(EnabledContext)
        const element = useRef()
        useLayoutEffect(() => {
            seen.push({enabled, hidden: Boolean(element.current.closest('[class*=disabled]'))})
        }, [enabled])
        return <div ref={element}/>
    }

    const show = enabled => act(() => root.render(
        <Enabled enabled={enabled}>
            <Panel placement='inline'>
                <Content/>
            </Panel>
        </Enabled>
    ))

    it('is hidden in the render that disables it and displayed in the render that enables it', () => {
        seen.splice(0)

        show(true)
        show(false)
        show(true)

        expect(seen).toEqual([
            {enabled: true, hidden: false},
            {enabled: false, hidden: true},
            {enabled: true, hidden: false}
        ])
    })
})
