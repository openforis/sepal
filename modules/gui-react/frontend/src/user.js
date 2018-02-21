import Http from 'http-client'
import {httpCallFailed} from 'errors'
import actionRegistry from 'action-registry'

export const loadCurrentUser = () =>
    (dispatch) => {
        dispatch(loadingCurrentUser())
        Http.get('/user/current', {
            handle: {
                200: (user) => dispatch(loadedCurrentUser(user)),
                401: () => dispatch(loadedCurrentUser(null)),
            }
        }).catch((error) => dispatch(httpCallFailed(error)))
    }

export const login = (username, password) =>
    (dispatch) => {
        dispatch(loggingIn())
        Http.post('/user/login', {
            username: username,
            password: password,
            handle: {
                200: (user) => dispatch(loggedIn(user)),
                401: () => dispatch(invalidCredentials())
            },
        }).catch((error) => dispatch(httpCallFailed(error)))
    }

export const validateToken = (token) =>
    (dispatch) => {
        console.log('validating token ' + token)
    }

export const resetPassword = (token, password) =>
    (dispatch) => {
        console.log('resetting password')
    }

export const isLoadingUser = (state) =>
    !state.app.userState || state.app.userState === 'LOADING_USER'

export const getCurrentUser = (state) =>
    state.app.user

export const invalidCredentialsProvided = (state) =>
    state.app.loginState === 'INVALID_CREDENTIALS'


const loadingCurrentUser = actionRegistry.register(
    'LOADING_USER',
    (state) => Object.assign({}, state, {userState: 'LOADING_USER', user: null})
)

const loadedCurrentUser = actionRegistry.register(
    'LOADED_USER',
    (state, action) => Object.assign({}, state, {userState: 'LOADED_USER', user: action.user}),
    (user) => ({user: user})
)

const loggingIn = actionRegistry.register(
    'LOGGING_IN',
    (state) => Object.assign({}, state, {loginState: 'LOGGING_IN'})
)

const loggedIn = actionRegistry.register(
    'LOGGED_IN',
    (state, action) => Object.assign({}, state, {loginState: 'LOGGED_IN', user: action.user}),
    (user) => ({user: user})
)

const invalidCredentials = actionRegistry.register('INVALID_CREDENTIALS',
    (state) => Object.assign({}, state, {loginState: 'INVALID_CREDENTIALS'})
)
