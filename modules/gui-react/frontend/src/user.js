import Rx from 'rxjs'
import Http from 'http-client'

export const currentUser$ = new Rx.BehaviorSubject(null)

export function loadCurrentUser$() {
    return Http.get$('/user/current', {
        validStatuses: [200, 401]
    }).map((e) => e.response)
}

export function login$(username, password) {
    return Http.post$('/user/login', {
        username: username,
        password: password,
        validStatuses: [200, 401]
    }).map((e) => e.response)
}

export function requestPasswordReset$(email) {
    return Http.post$('/user/password/reset-request', {
        body: {
            email: email
        }
    })
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
