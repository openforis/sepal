import fetch from 'cross-fetch'
import base64 from 'base-64'
import {connect} from 'react-redux'
import LoginView from './login-view'
import actionRegistry from 'action-registry'

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




const serverConnectionFailed = (error) => ({
    type: 'SERVER_CONNECTION_FAILED',
    error: error

})

const unexpectedResponseStatus = (response) => ({
    type: 'UNEXPECTED_RESPONSE_STATUS',
    response: response

})

const postLogin = (username, password) =>
    fetch('/user/login', {
        method: 'POST',
        headers: {
            'Authorization': 'Basic ' + base64.encode(username + ":" + password),
            'No-auth-challenge': true
        }
    })

const login = (username, password) =>
    dispatch => {
        dispatch(loggingIn())
        postLogin(username, password)
            .then(
                (response) => {
                    switch (response.status) {
                        case 200:
                            return Promise.resolve(response.json())
                        case 401:
                            return Promise.reject(invalidCredentials())
                        default:
                            return Promise.reject(unexpectedResponseStatus(response))
                    }

                },
                (error) => Promise.reject(dispatch(serverConnectionFailed(error)))
            )
            .then(
                (user) => dispatch(loggedIn(user)),
                (action) => dispatch(action)
            )
    }

const mapStateToProps = (state) => ({
    errors: state.loginState === 'INVALID_CREDENTIALS' ? {password: 'Invalid username/password'} : {}
})

const mapDispatchToProps = (dispatch) => ({
    onLogin: ({username, password}) => dispatch(login(username, password))
})

const Login = connect(
    mapStateToProps,
    mapDispatchToProps
)(LoginView)

export default Login