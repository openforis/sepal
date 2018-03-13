import Rx from 'rxjs'
import Http from 'http-client'
import {fromState} from 'store'
import actionBuilder from 'action-builder'

export const currentUser = () => fromState('user.currentUser')
export const loadedCurrentUser = () => fromState('user.loadedCurrentUser')
export const invalidCredentials = () => fromState('user.invalidCredentials')

export const resetInvalidCredentials = () => actionBuilder('RESET_INVALID_CREDENTIALS')
    .del('user.invalidCredentials')
    .dispatch()


export function loadCurrentUser$() {
    return Http.get$('/user/current', {
            validStatuses: [200, 401]
        }
    ).map((e) =>
        actionBuilder('CURRENT_USER_LOADED')
            .set('user.loadedCurrentUser', true)
            .set('user.currentUser', e.response)
            .build()
    )
}

export function login$(username, password) {
    return Http.post$('/user/login', {
            username, password,
            validStatuses: [200, 401]
        }
    ).map((e) => actionBuilder('CREDENTIALS_POSTED')
        .set('user.currentUser', e.response)
        .set('user.invalidCredentials', !e.response)
        .build()
    )
}

export function requestPasswordReset$(email) {
    return Http.post$('/user/password/reset-request', {
            body: {email}
        }
    ).filter(() => false)
}

export function validateToken$(token) {
    return Http.get$('/user/validate-token', {
            body: {token}
        }
    ).switchMap((e) => (e.response.user
        ? Rx.Observable.of(e.response.user)
        : Rx.Observable.throw(e))
    ).filter(() => false)
}

export function resetPassword$(token, username, password) {
    Http.get$('/user/password/reset', {
            body: {
                token: token,
                password: password
            }
        }
    ).switchMap(
        () => login$(username, password)
    )
}
