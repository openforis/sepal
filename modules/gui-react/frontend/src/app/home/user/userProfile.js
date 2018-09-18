import {connect} from 'store'
import ChangePassword from './changePassword'
import PropTypes from 'prop-types'
import React from 'react'
import Tooltip from 'widget/tooltip'
import UserDetails from './userDetails'
import actionBuilder from 'action-builder'

const mapStateToProps = (state) => {
    const user = state.user.currentUser
    return {
        username: user.username,
        panel: state.ui && state.ui.userProfile,
        modal: state.ui && state.ui.modal
    }
}

const action = (mode) =>
    actionBuilder('USER_PROFILE')
        .set('ui.userProfile', mode)
        .set('ui.modal', !!mode)
        .dispatch()

export const showUserDetails = () =>
    action('USER_DETAILS')

export const showChangePassword = () =>
    action('CHANGE_PASSWORD')

export const closePanel = () =>
    action()

class UserProfile extends React.Component {
    buttonHandler() {
        const {panel, modal} = this.props
        if (!panel && !modal) {
            showUserDetails()
        }
    }

    renderButton() {
        const {className, username, modal} = this.props
        return (
            <Tooltip msg='home.sections.user.profile' top disabled={modal}>
                <button className={className} onClick={() => this.buttonHandler()}>
                    {username}
                </button>
            </Tooltip>
        )
    }

    render() {
        const {panel} = this.props
        const showUserDetails = panel === 'USER_DETAILS'
        const showChangePassword = panel === 'CHANGE_PASSWORD'
        return (
            <React.Fragment>
                {this.renderButton()}
                {showUserDetails ? <UserDetails/> : null}
                {showChangePassword ? <ChangePassword/> : null}
            </React.Fragment>
        )
    }
}

UserProfile.propTypes = {
    className: PropTypes.string
}

export default connect(mapStateToProps)(UserProfile)
