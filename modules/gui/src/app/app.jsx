import './reset.css'
import './app.css'
import '../style/look.css'
import '../style/look.module.css'

import PropTypes from 'prop-types'
import React from 'react'

import {Home} from '~/app/home/home'
import {Landing} from '~/app/landing/landing'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {isPathInLocation} from '~/route'
import {selectFrom} from '~/stateUtils'
import {loadUser$, startLoggedOff} from '~/user'
import {EventShield} from '~/widget/eventShield'
import {Notifications} from '~/widget/notifications'
import {ViewportResizeSensor} from '~/widget/viewportResizeSensor'

const mapStateToProps = state => ({
    initialized: selectFrom(state, 'user.initialized'),
    loggedOn: selectFrom(state, 'user.loggedOn'),
    hasDimensions: !!selectFrom(state, 'dimensions')
})

class _App extends React.Component {
    render() {
        const {hasDimensions} = this.props
        return (
            <div className='app'>
                <EventShield>
                    <ViewportResizeSensor/>
                    {hasDimensions ? this.renderBody() : null}
                    <Notifications/>
                </EventShield>
            </div>
        )
    }

    renderBody() {
        const {initialized, loggedOn} = this.props
        return initialized
            ? loggedOn
                ? <Home/>
                : <Landing/>
            : <Loader/>
    }

    componentDidMount() {
        const {stream} = this.props
        if (isSetPasswordLink()) {
            startLoggedOff()
        } else {
            stream('LOAD_USER', loadUser$())
        }
    }
}

const SET_PASSWORD_PATHS = ['/reset-password', '/setup-account']

const isSetPasswordLink = () =>
    SET_PASSWORD_PATHS.some(path => isPathInLocation(path, window.location.pathname))

const Loader = () =>
    <div className="app-loader">
        <span/>
        <p>S E P A L</p>
    </div>

export const App = compose(
    _App,
    connect(mapStateToProps)
)

App.propTypes = {
    currentUser: PropTypes.object
}
