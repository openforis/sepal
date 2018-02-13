import React from 'react'
import Http from 'http-client'
import {httpCallFailed} from 'errors'
import actionRegistry from 'action-registry'
import {connect} from 'react-redux'
import Landing from 'app/landing/landing'
import Home from 'app/home/home'
import 'bootstrap/dist/css/bootstrap-reboot.css'
import './app.css'

const loadingUser = actionRegistry.register(
    'LOADING_USER',
    (state) => Object.assign({}, state, {userState: 'LOADING_USER', user: null})
)

const loadedUser = actionRegistry.register(
    'LOADED_USER',
    (state, action) => Object.assign({}, state, {userState: 'LOADED_USER', user: action.user}),
    (user) => ({user: user})
)

const loadUser = () =>
    dispatch => {
        dispatch(loadingUser())
        Http.get('/user/current', {
            handle: {
                200: (user) => dispatch(loadedUser(user)),
                401: () => dispatch(loadedUser(null)),
            }
        }).catch((error) => dispatch(httpCallFailed(error)))
    }

const mapStateToProps = (state) => ({
    user: state.user,
    loadedUser: state.userState === 'LOADED_USER'
})

const mapDispatchToProps = (dispatch) => ({
    loadUser: () => dispatch(loadUser())
})

const Loader = () =>
    <div className="app-loader">
        <span></span>
        <p>S E P A L</p>
    </div>

const App = connect(mapStateToProps, mapDispatchToProps)(
    class AppView extends React.Component {
        componentWillMount() {
            this.props.loadUser()
        }

        render() {
            const {user, loadedUser} = this.props
            if (!loadedUser)
                return <Loader/>
            else if (user)
                return <Home user={user}/>
            else
                return <Landing/>
        }
    }
)
export default App
