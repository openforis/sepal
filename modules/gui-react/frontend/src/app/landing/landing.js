import actionRegistry from 'action-registry'
import Http from 'http-client'
import {httpCallFailed} from 'errors'
import {connect} from 'react-redux'
import LandingView from './landing-view'

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

const login = (username, password) =>
    dispatch => {
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

const mapStateToProps = (state) => ({
    errors: state.loginState === 'INVALID_CREDENTIALS' ? {password: 'Invalid username/password'} : {}
})

const mapDispatchToProps = (dispatch) => ({
    onLogin: ({username, password}) => dispatch(login(username, password))
})

const Landing = connect(mapStateToProps, mapDispatchToProps)(LandingView)
export default Landing