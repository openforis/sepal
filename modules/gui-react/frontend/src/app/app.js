import actionBuilder from 'action-builder'
import Home from 'app/home/home'
import Landing from 'app/landing/landing'
import Notifications from 'app/notifications'
import 'bootstrap/dist/css/bootstrap-reboot.css'
import PropTypes from 'prop-types'
import React from 'react'
import ReactResizeDetector from 'react-resize-detector'
import {connect} from 'store'
import {currentUser, loadCurrentUser$} from 'user'
import '../style/button-colors.default.css'
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
                <ReactResizeDetector
                    handleWidth
                    handleHeight
                    onResize={(width, height) =>
                        actionBuilder('SET_APP_DIMENSIONS')
                            .set('dimensions', {width, height})
                            .dispatch()
                    }/>
                {this.body()}
            </div>
        )
    }

    body() {
        const {currentUser, action} = this.props
        return action('LOAD_CURRENT_USER').dispatched
            ? currentUser
                ? <Home user={currentUser}/>
                : <Landing/>
            : <Loader/>
    }
}

App.propTypes = {
    asyncActionBuilder: PropTypes.func,
    currentUser: PropTypes.object,
    action: PropTypes.func
}

const Loader = () =>
    <div className="app-loader">
        <span/>
        <p>S E P A L</p>
    </div>

export default connect(mapStateToProps)(App)
