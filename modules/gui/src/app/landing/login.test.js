import {NEVER, of} from 'rxjs'
import {describe, expect, it, vi} from 'vitest'

// Retrying a login must not keep showing the previous attempt's error while reCAPTCHA is still answering. The
// assertion is on the invalid-credentials flag, which is what the password field renders from. `compose` is
// mocked to the identity so the exported component is the class; nothing renders.

const state = vi.hoisted(() => ({invalidCredentials: false, loginArgs: []}))

vi.mock('~/compose', () => ({
    compose: Component => Component,
    composeHoC: () => Component => Component
}))

vi.mock('~/translate', () => ({msg: key => key}))

vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))

// The panel builds its field descriptors at module load.
vi.mock('~/widget/form', () => {
    class Field {
        notBlank() { return this }
    }
    return {Form: {Field, Input: 'input'}}
})

vi.mock('~/user', () => ({
    credentialsPosted: () => {},
    invalidCredentials: () => state.invalidCredentials,
    resetInvalidCredentials: () => state.invalidCredentials = false,
    login$: (...args) => {
        state.loginArgs.push(args)
        return NEVER
    }
}))

const {Login} = await import('./login')

const CREDENTIALS = {username: 'someone', password: 'correct-horse'}

const submitLogin = ({invalidCredentials, recaptcha$ = () => NEVER}) => {
    state.invalidCredentials = invalidCredentials
    state.loginArgs = []
    const stream = Object.assign(
        (_name, stream$, next, error) => stream$ && stream$.subscribe({next, error}),
        {}
    )
    const instance = new Login({
        form: {values: () => CREDENTIALS, isInvalid: () => false},
        stream: (...args) => args.length > 1 ? stream(...args) : {active: false},
        recaptcha: {recaptcha$}
    })
    instance.submit()
    return state
}

describe('starting another login attempt', () => {
    it('clears the previous attempt error before reCAPTCHA has answered', () => {
        expect(submitLogin({invalidCredentials: true}).invalidCredentials).toBe(false)
    })

    it('waits for reCAPTCHA before posting the credentials', () => {
        expect(submitLogin({invalidCredentials: true}).loginArgs).toEqual([])
    })

    it('posts the credentials once reCAPTCHA answers', () => {
        const {loginArgs} = submitLogin({invalidCredentials: true, recaptcha$: () => of('a-token')})

        expect(loginArgs).toEqual([[CREDENTIALS, 'a-token']])
    })
})
