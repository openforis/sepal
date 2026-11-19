import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {Provider} from 'react-redux'
import {legacy_createStore as createStore} from 'redux'
import {of, throwError} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

import {initStore} from '~/store'
import {ActivationContext} from '~/widget/activation/activationContext'
import buttonStyles from '~/widget/button.module.css'

// The hint drawing the user to their account: raised by what finds the account needs them, shown on the user button,
// and withdrawn as the notification saying why is dismissed. The session service, the user panels and the
// notifications are real; only the user and Earth Engine services answer from here.

const fake = vi.hoisted(() => ({users: []}))

vi.mock('~/apiRegistry', () => ({default: {
    user: {
        loadCurrentUser$: () => of(fake.users.shift()),
        revokeGoogleAccess$: () => of(null)
    },
    gee: {
        healthcheck$: () => throwError(() => ({response: {errorCode: 'MISSING_GOOGLE_TOKENS'}}))
    }
}}))
vi.mock('~/translate', () => ({msg: key => key, getLanguage: () => 'en'}))

const {loadUser$} = await import('~/user')
const {userDetailsHint} = await import('./userDetailsHint')
const {UserDetailsButton} = await import('./userDetails')
const {Notifications} = await import('~/widget/notifications')
const {EventShield} = await import('~/widget/eventShield')
const {PortalContainer} = await import('~/widget/portal')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const USERNAME = 'someone'
const GOOGLE_USER = {username: USERNAME, googleTokens: {projectId: 'some-project'}}
const REVOKED_USER = {username: USERNAME}

let root, container

beforeEach(() => {
    vi.stubGlobal('gtag', () => {})
})

afterEach(async () => {
    await act(async () => root?.unmount())
    root = null
    container?.remove()
    vi.unstubAllGlobals()
})

describe('the user-details hint', () => {
    it('is shown when the session finds the Google tokens missing, and withdrawn as the notification is dismissed', async () => {
        await mount(GOOGLE_USER)
        fake.users = [GOOGLE_USER, REVOKED_USER]

        await act(async () => loadUser$().subscribe())
        expect(hinted()).toBe(true)

        await act(async () => notification('user.googleAccount.revoked.title').click())
        expect(hinted()).toBe(false)
    })

    it('is not shown by a button mounted after it was raised', async () => {
        userDetailsHint(true)

        await mount(REVOKED_USER)
        expect(hinted()).toBe(false)

        await act(async () => userDetailsHint(true))
        expect(hinted()).toBe(true)
    })
})

const hinted = () => {
    const button = [...document.querySelectorAll('button')].find(({textContent}) => textContent.includes(USERNAME))
    expect(button, 'no user button').toBeDefined()
    return button.classList.contains(buttonStyles.hint)
}

const notification = title => {
    const element = [...document.querySelectorAll('div')].reverse().find(({textContent}) => textContent === title)
    expect(element, `no notification ${title}`).toBeDefined()
    return element.closest('[class*="notification"]')
}

async function mount(user) {
    const store = createStore((state = {dimensions: {width: 1024, height: 768}, user: {currentUser: user}}, action) => action.reduce ? action.reduce(state) : state)
    initStore(store)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(
        <Provider store={store}>
            <PortalContainer/>
            <EventShield>
                <ActivationContext id='root'>
                    <UserDetailsButton/>
                </ActivationContext>
                <Notifications/>
            </EventShield>
        </Provider>
    ))
}
