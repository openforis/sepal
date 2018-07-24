import actionBuilder from 'action-builder'
import api from 'backend'
import {filter, map, switchMap} from 'rxjs/operators'
import {select} from 'store'

export const currentUser = () => select('user.currentUser')
export const invalidCredentials = () => select('user.invalidCredentials')

export const resetInvalidCredentials = () =>
    actionBuilder('RESET_INVALID_CREDENTIALS')
        .del('user.invalidCredentials')
        .dispatch()


export function loadCurrentUser$() {
    return api.user.loadCurrentUser$().pipe(
        map((user) =>
            actionBuilder('SET_CURRENT_USER', {user})
                .set('user.currentUser', user)
                .build()
        )
    )
}


export function login$(username, password) {
    resetInvalidCredentials()
    return api.user.login$(username, password).pipe(
        map((user) => actionBuilder('CREDENTIALS_POSTED')
            .set('user.currentUser', user)
            .set('user.invalidCredentials', !user)
            .build()
        )
    )
}

export function requestPasswordReset$(email) {
    return api.user.requestPasswordReset$(email).pipe(
        filter(() => false)
    )
}

export function validateToken$(token) {
    return api.user.validateToken$(token).pipe(
        map(({user}) =>
            actionBuilder('TOKEN_VALIDATED',
                {valid: !!user})
                .set('user.tokenUser', user)
                .build())
    )
}

export const tokenUser = () => select('user.tokenUser')

export function resetPassword$(token, username, password) {
    return api.user.resetPassword$(token, username, password).pipe(
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