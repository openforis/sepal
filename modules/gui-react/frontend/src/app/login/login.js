import Http from 'http-client'
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

const httpCallFailed = (error) => ({
    type: 'HTTP_CALL_FAILED',
    error: error
})

const login = (username, password) =>
    dispatch => {
        dispatch(loggingIn())
        Http.post('/user/login', {
            username: username,
            password: password,
            retries: 5,
            handle: {
                200: (user) => dispatch(loggedIn(user)),
                401: () => dispatch(invalidCredentials())
            },
        }).catch((error) => dispatch(httpCallFailed(error)))
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