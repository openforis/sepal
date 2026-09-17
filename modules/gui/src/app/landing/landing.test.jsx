import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {MemoryRouter} from 'react-router'
import {of} from 'rxjs'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'

// Launching from the intro must not ask for credentials the browser already has: a tab left on the
// landing page while another tab logged in should go straight in. The session check is the same
// `loadUser$` the app runs at start-up, which reports the outcome through the store rather than
// its emitted value (a health-check result, of no use here); the fake does the same.

const session = {user: null}
vi.mock('~/user', () => ({
    loadUser$: () => of(true),
    currentUser: () => session.user
}))

vi.mock('./intro', () => ({Intro: ({onLaunch}) => <button data-testid='launch' onClick={onLaunch}/>}))
vi.mock('./credentials', () => ({Credentials: () => <div data-testid='credentials'/>}))
vi.mock('./slideshow/slideshow', () => ({Slideshow: () => null}))
vi.mock('./feature', () => ({Feature: () => null}))
vi.mock('./tagline', () => ({Tagline: () => null}))
vi.mock('./title', () => ({Title: () => null}))
vi.mock('~/app/landing/languageSelector', () => ({LanguageSelector: () => null}))
vi.mock('~/widget/button', () => ({Button: () => null}))
vi.mock('~/translate', () => ({msg: key => key}))

const {Landing} = await import('./landing')

globalThis.IS_REACT_ACT_ENVIRONMENT = true

describe('Landing', () => {
    let root, container

    beforeEach(() => {
        container = document.body.appendChild(document.createElement('div'))
        root = createRoot(container)
        act(() => root.render(<MemoryRouter initialEntries={['/']}><Landing/></MemoryRouter>))
    })

    afterEach(() => {
        act(() => root.unmount())
        container.remove()
    })

    const launch = () =>
        act(() => container.querySelector('[data-testid=launch]').click())

    const credentialsShown = () =>
        !!container.querySelector('[data-testid=credentials]')

    it('asks for credentials on launch when the browser has no session', () => {
        session.user = null

        launch()

        expect(credentialsShown()).toBe(true)
    })

    it('skips the credentials on launch when the browser is already logged in', () => {
        session.user = {username: 'alice'}

        launch()

        expect(credentialsShown()).toBe(false)
    })
})
