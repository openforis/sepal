import Rx from 'rxjs'
import Http from 'http-client'
import {createAction, state} from 'store'

export const currentUser = () => state().currentUser
export const loadedCurrentUser = () => state().loadedCurrentUser
export const invalidCredentials = () => state().invalidCredentials


export function loadCurrentUser$() {
    // Dispatch whatever, whenever, but return one completion or error action
    return Http.get$('/user/current', {
            validStatuses: [200, 401]
        }
    ).map((e) => createAction(
        (state) => state
            .set('loadedCurrentUser', true)
            .set('currentUser', e.response)
    ))
}

export function login$(username, password) {
    return Http.post$('/user/login', {
            username, password,
            validStatuses: [200, 401]
        }
    ).map((e) => createAction(
        (state) => state
            .set('currentUser', e.response)
            .set('invalidCredentials', !e.response)
    ))
}

export function requestPasswordReset$(email) {
    return Http.post$('/user/password/reset-request', {
            body: {email}
        }
    ).map((e) => createAction())
}

export function validateToken$(token) {
    Http.get$('/user/validate-token', {
            body: {token}
        }
    ).switchMap((e) => (e.response.user
        ? Rx.Observable.of(e.response.user)
        : Rx.Observable.throw(e))
    ).map((e) => createAction())
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
