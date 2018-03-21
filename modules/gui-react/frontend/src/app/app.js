import React from 'react'
import {connect} from 'store'
import {currentUser, loadCurrentUser$} from 'user'
import Notifications from 'app/notifications'
import Home from 'app/home/home'
import Landing from 'app/landing/landing'
import 'bootstrap/dist/css/bootstrap-reboot.css'
import './app.css'

const mapStateToProps = () => ({
    currentUser: currentUser()
})

class App extends React.Component {
    componentWillMount() {
        this.props.asyncActionBuilder('LOAD_CURRENT_USER',
            loadCurrentUser$())
            .dispatch()
    }

    render() {
        return (
            <div className='app'>
                <Notifications/>
                {this.body()}
            </div>
        )
    }

    body() {
        const {currentUser, action} = this.props
        if (!action('LOAD_CURRENT_USER').dispatched)
            return <Loader/>
        else if (currentUser)
            return <Home user={currentUser}/>
        else
            return <Landing/>
    }
}

export default App = connect(mapStateToProps)(App)

const Loader = () =>
    <div className="app-loader">
        <span/>
        <p>S E P A L</p>
    </div>
