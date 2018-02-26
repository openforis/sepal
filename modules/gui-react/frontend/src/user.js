import Http from 'http-client'
import {httpCallFailed} from 'errors'
import {dispatch, state} from 'store'

export const loadCurrentUser = () => {
    loadingCurrentUser()
    Http.get('/user/current', {
        handle: {
            200: (user) => loadedCurrentUser(user),
            401: () => loadedCurrentUser(null),
        }
    }).catch((error) => httpCallFailed(error))
}

export const login = (username, password) => {
    loggingIn()
    Http.post('/user/login', {
        username: username,
        password: password,
        handle: {
            200: (user) => loggedIn(user),
            401: () => invalidCredentials()
        },
    }).catch((error) => httpCallFailed(error))
}

export const validateToken = (token) => {
    console.log('validating token ' + token)
}

export const resetPassword = (token, password) => {
    console.log('resetting password')
}


export const isLoadingUser = () => {
    console.log('isLoadingUser', !state().app.userState || state().app.userState === 'LOADING_USER', state())
    return !state().app.userState || state().app.userState === 'LOADING_USER'
}

export const getCurrentUser = () => {
    return state().app.user
}

export const invalidCredentialsProvided = () => {
    return state().app.loginState === 'INVALID_CREDENTIALS'
}

const loadingCurrentUser = () => dispatch({
    type: 'LOADING_USER',
    reduce(state) {
        return Object.assign({}, state, {
            userState: 'LOADING_USER',
            user: null
        })
    }
})

const loadedCurrentUser = (user) => dispatch({
    type: 'LOADED_USER',
    reduce(state) {
        return Object.assign({}, state, {
            userState: 'LOADED_USER',
            user: user
        })
    }
})

const loggingIn = () => dispatch({
    type: 'LOGGING_IN',
    reduce(state) {
        return Object.assign({}, state, {loginState: 'LOGGING_IN'})
    }
})

const loggedIn = (user) => dispatch({
    type: 'LOGGED_IN',
    reduce(state) {
        return Object.assign({}, state, {
            loginState: 'LOGGED_IN',
            user
        })
    }
})

const invalidCredentials = () => dispatch({
    type: 'INVALID_CREDENTIALS',
    reduce(state) {
        return Object.assign({}, state, {
            loginState: 'INVALID_CREDENTIALS'
        })
    }
})
