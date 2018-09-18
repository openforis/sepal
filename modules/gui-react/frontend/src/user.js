import {filter, map, switchMap} from 'rxjs/operators'
import {select} from 'store'
import actionBuilder from 'action-builder'
import api from 'backend'

export const currentUser = () => select('user.currentUser')
export const invalidCredentials = () => select('user.login.invalidCredentials')

export const resetInvalidCredentials = () =>
    actionBuilder('RESET_INVALID_CREDENTIALS')
        .del('user.login.invalidCredentials')
        .dispatch()

export const loadCurrentUser$ = () =>
    api.user.loadCurrentUser$().pipe(
        map((user) =>
            actionBuilder('SET_CURRENT_USER', {user})
                .set('user.currentUser', user)
                .build()
        )
    )

export const login$ = (username, password) => {
    resetInvalidCredentials()
    return api.user.login$(username, password).pipe(
        map((user) => actionBuilder('CREDENTIALS_POSTED')
            .set('user.currentUser', user)
            .set('user.login.invalidCredentials', !user)
            .build()
        )
    )
}

export const requestPasswordReset$ = (email) =>
    api.user.requestPasswordReset$(email).pipe(
        filter(() => false)
    )

export const validateToken$ = (token) =>
    api.user.validateToken$(token).pipe(
        map(({user}) =>
            actionBuilder('TOKEN_VALIDATED', {valid: !!user})
                .set('user.tokenUser', user)
                .build())
    )

export const tokenUser = () =>
    select('user.tokenUser')

export const resetPassword$ = (token, username, password) =>
    api.user.resetPassword$(token, username, password).pipe(
        switchMap(
            () => login$(username, password)
        )
    )

export const logout = () =>
    actionBuilder('LOGOUT')
        .del('user')
        .dispatch()

export const updateUserDetails$ = ({name, email, organization}) => {
    actionBuilder('UPDATE_USER_DETAILS', {name, email, organization})
        .set('user.currentUser.name', name)
        .set('user.currentUser.email', email)
        .set('user.currentUser.organization', organization)
        .dispatch()
    return api.user.updateUserDetails$({name, email, organization})
}

export const changeUserPassword$ = ({oldPassword, newPassword}) =>
    api.user.changePassword$({oldPassword, newPassword}).pipe(
        map(({status}) => actionBuilder('PASSWORD_CHANGE_POSTED', {status})
            .build()
        )
    )

export const info = () => {
    // console.log('user info')
}
