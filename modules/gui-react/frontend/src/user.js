import Rx from 'rxjs'
import Http from 'http-client'
import {state, updateState} from 'store'

export const currentUser = () => state().currentUser
export const loadedCurrentUser = () => state().loadedCurrentUser
export const invalidCredentials = () => state().invalidCredentials

export function loadCurrentUser$() {
    return (action$) => action$
        .mergeMap(() =>
            Http.get$('/user/current', {
                validStatuses: [200, 401]
            })
        )
        .map((e) => updateState('Loaded current user', {
            'loadedCurrentUser': true,
            'currentUser': e.response
        }))
}

export function login$(username, password) {
    return (action$) => action$
        .switchMap(() =>
            Http.post$('/user/login', {
                username, password,
                validStatuses: [200, 401]
            })
        )
        .map((e) => updateState('Submitted credentials', {
            'login': 'COMPLETE',
            'currentUser': e.response,
            'invalidCredentials': !e.response
        }))
}

export function requestPasswordReset$(email) {
    return (action$) => action$
        .mergeMap(() =>
            Http.post$('/user/password/reset-request', {
                body: {email}
            })
        )
        .map((e) => updateState('Requested password reset', {
            'requestPasswordReset': 'COMPLETE'
        }))
}


export function validateToken$(token) {
    return (action$) => action$
        .mergeMap(() =>
            Http.get$('/user/validate-token', {
                body: {token}
            })
        )
        .switchMap((e) => (e.response.user
            ? Rx.Observable.of(e.response.user)
            : Rx.Observable.throw(e)))
        .map((e) => updateState('Validated token', {
            'validatedToken': true
        }))
}

export function resetPassword$(token, username, password) {
    return (action$) => action$
        .mergeMap(() =>
            Http.get$('/user/password/reset', {
                body: {
                    token: token,
                    password: password
                }
            })
        )
        .mergeMap(() => login$(username, password))
        .map((e) => updateState('Reset password', {
            'resetPassword': true
        }))
}
