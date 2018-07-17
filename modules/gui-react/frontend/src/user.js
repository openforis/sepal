import actionBuilder from 'action-builder'
import Http from 'http-client'
import {filter, map, switchMap} from 'rxjs/operators'
import {select} from 'store'

export const currentUser = () => select('user.currentUser')
export const invalidCredentials = () => select('user.invalidCredentials')

export const resetInvalidCredentials = () =>
    actionBuilder('RESET_INVALID_CREDENTIALS')
        .del('user.invalidCredentials')
        .dispatch()


export function loadCurrentUser$() {
    return Http.get$('/user/current', {
        validStatuses: [200, 401]
    }).pipe(
        map((e) =>
            actionBuilder('SET_CURRENT_USER', {user: e.response})
                .set('user.currentUser', e.response)
                .build()
        )
    )
}


export function login$(username, password) {
    resetInvalidCredentials()
    return Http.post$('/user/login', {
        username, password,
        validStatuses: [200, 401]
    }).pipe(
        map((e) => actionBuilder('CREDENTIALS_POSTED')
            .set('user.currentUser', e.response)
            .set('user.invalidCredentials', !e.response)
            .build()
        )
    )
}

export function requestPasswordReset$(email) {
    return Http.post$('/user/password/reset-request', {
        body: {email}
    }).pipe(
        filter(() => false)
    )
}

export function validateToken$(token) {
    return Http.post$('/user/validate-token', {
        body: {token}
    }).pipe(
        map((e) => {
            const user = e.response && e.response.user
            return actionBuilder('TOKEN_VALIDATED',
                {valid: !!user})
                .set('user.tokenUser', user)
                .build()
        })
    )
}

export const tokenUser = () => select('user.tokenUser')

export function resetPassword$(token, username, password) {
    return Http.post$('/user/password/reset', {
        body: {
            token: token,
            password: password
        }
    }).pipe(
        switchMap(
            () => login$(username, password)
        )
    )
}

export function logout() {
    actionBuilder('LOGOUT')
        .del('user')
        .dispatch()
}

export function profile() {
    console.log('user profile')
}

export function info() {
    console.log('user info')
}