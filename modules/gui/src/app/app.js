import {EventShield} from 'widget/eventShield'
import {Home} from '~/app/home/home'
import {Landing} from '~/app/landing/landing'
import {Notifications} from '~/widget/notifications'
import {ViewportResizeSensor} from '~/widget/viewportResizeSensor'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {loadUser$} from '~/user'
import {selectFrom} from '~/stateUtils'
import PropTypes from 'prop-types'
import React from 'react'
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
        stream('LOAD_USER', loadUser$())
    }
}

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
