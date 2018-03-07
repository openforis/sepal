import Rx from 'rxjs'
import Http from 'http-client'
import {epic, state, updateState} from 'store'

export const currentUser = () => state().currentUser
export const loadedCurrentUser = () => state().loadedCurrentUser
export const invalidCredentials = () => state().invalidCredentials

export function loadCurrentUser() {
    epic('Loading current user', (action$) => {
        return action$
            .mergeMap(() =>
                Http.get$('/user/current', {
                    validStatuses: [200, 401]
                })
            )
            .map((e) => updateState('Loaded current user', {
                'loadedCurrentUser': true,
                'currentUser': e.response
            }))
    })
}

export function login(username, password) {
    epic('Logging in', (action$) => {
        return action$
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
    })
}

export function requestPasswordReset(email) {
    epic('Requesting password reset', (action$) => {
        return action$
            .mergeMap(() =>
                Http.post$('/user/password/reset-request', {
                    body: {email}
                })
            )
            .map((e) => updateState('Requested password reset', {
                'requestPasswordReset': 'COMPLETE',
                'location': {pathname: '/'} // TODO: Fix this somehow
            }))
    })
}


export function login$(username, password) {
    return Http.post$('/user/login', {
        username: username,
        password: password,
        validStatuses: [200, 401]
    }).map((e) => e.response)
}

export function validateToken$(token) {
    return Http.post$('/user/validate-token', {
        body: {
            token: token
        }
    }).switchMap((e) => (e.response.user
        ? Rx.Observable.of(e.response.user)
        : Rx.Observable.throw(e)))
}

export function resetPassword$(token, password) {
    return Http.post$('/user/password/reset', {
        body: {
            token: token,
            password: password
        }
    })
}
