import React from 'react'
import {connect} from 'react-redux'
import {getCurrentUser, isLoadingUser, loadCurrentUser} from 'user'
import Landing from 'app/landing/landing'
import Home from 'app/home/home'
import 'bootstrap/dist/css/bootstrap-reboot.css'
import './app.css'
import {Route, Switch} from "route"

const mapStateToProps = (state) => ({
    user: getCurrentUser(state),
    loadingUser: isLoadingUser(state)
})

const mapDispatchToProps = (dispatch) => ({
    loadUser: () => dispatch(loadCurrentUser())
})

const Loader = () =>
    <div className="app-loader">
        <span/>
        <p>S E P A L</p>
    </div>

const App = connect(mapStateToProps, mapDispatchToProps)(
    class AppView extends React.Component {
        componentWillMount() {
            this.props.loadUser()
        }

        render() {
            return (
                <Switch>
                    <Route path='/login' component={Landing}/>
                    <Route path='/home' component={Home} user={{username: 'some username'}}/>
                </Switch>
            )
            // const {user, loadingUser} = this.props
            // if (loadingUser)
            //     return <Loader/>
            // else if (user)
            //     return <Home user={user}/>
            // else
            //     return <Landing/>
        }
    }
)
export default App
