import Http from 'http-client'
import {httpCallFailed} from 'errors'
import {named} from 'named'
import rx from 'rxjs'

export const loadingCurrentUser$ = named('LOADING_CURRENT_USER', new rx.Subject())
export const currentUser$ = named('CURRENT_USER', new rx.ReplaySubject(1))
export const loggingIn$ = named('LOGGING_IN', new rx.Subject())
export const loggedIn$ = named('LOGGED_IN', new rx.Subject())
export const invalidCredentials$ = named('INVALID_CREDENTIALS', new rx.Subject())

export const loadCurrentUser = () => {
    loadingCurrentUser$.next()
    Http.get('/user/current', {
        handle: {
            200: (user) => currentUser$.next(user),
            401: () => currentUser$.next(null)
        }
    }).catch((error) => httpCallFailed(error))
}

export const login = (username, password) => {
    (() => loggingIn$.next())()
    Http.post('/user/login', {
        username: username,
        password: password,
        handle: {
            200: (user) => loggedIn$.next(user),
            401: () => invalidCredentials$.next()
        },
    }).catch((error) => httpCallFailed(error))
}

export const validateToken = (token) => {
    console.log('validating token ' + token)
}

export const resetPassword = (token, password) => {
    console.log('resetting password')
}