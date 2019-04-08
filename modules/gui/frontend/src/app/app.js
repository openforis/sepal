import {connect} from 'store'
import {selectFrom} from 'stateUtils'
import Home from 'app/home/home'
import Landing from 'app/landing/landing'
import Notifications from 'widget/notifications'
import PropTypes from 'prop-types'
import React from 'react'
import User from 'widget/user'
import ViewportResizeSensor from 'widget/viewportResizeSensor'

import css1 from './reset.css'
import css2 from './app.css'
import css3 from '../style/look.css'
import css4 from '../style/look.module.css'

const _css = [css1, css2, css3, css4] // eslint-disable-line

const mapStateToProps = state => ({
    initialized: selectFrom(state, 'user.initialized'),
    loggedOn: selectFrom(state, 'user.loggedOn'),
    hasDimensions: !!selectFrom(state, 'dimensions')
})

class App extends React.Component {
    render() {
        const {hasDimensions} = this.props
        return (
            <div className='app'>
                <User/>
                <ViewportResizeSensor/>
                {hasDimensions ? this.renderBody() : null}
                <Notifications/>
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
}

App.propTypes = {
    currentUser: PropTypes.object
}

const Loader = () =>
    <div className="app-loader">
        <span/>
        <p>S E P A L</p>
    </div>

export default connect(mapStateToProps)(App)
