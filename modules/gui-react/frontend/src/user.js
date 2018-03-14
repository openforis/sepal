import Http from 'http-client'
import {select} from 'store'
import actionBuilder from 'action-builder'

export const currentUser = () => select('user.currentUser')
export const invalidCredentials = () => select('user.invalidCredentials')

export const resetInvalidCredentials = () =>
    actionBuilder('RESET_INVALID_CREDENTIALS')
        .del('user.invalidCredentials')
        .dispatch()


export function loadCurrentUser$() {
    return Http.get$('/user/current', {
            validStatuses: [200, 401]
        }
    ).map((e) =>
        actionBuilder('CURRENT_USER_LOADED')
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
    return Http.post$('/user/validate-token', {
            body: {token}
        }
    ).map((e) => {
            const user = e.response && e.response.user
            return actionBuilder('TOKEN_VALIDATED',
                {valid: !!user})
                .set('user.tokenUser', user)
                .build()
        }
    )
}
export const tokenUser = () => select('user.tokenUser')

export function resetPassword$(token, username, password) {
    return Http.post$('/user/password/reset', {
            body: {
                token: token,
                password: password
            }
        }
    ).switchMap(
        () => login$(username, password)
    )
}
