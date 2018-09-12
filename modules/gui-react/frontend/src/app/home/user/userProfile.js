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
        ui: state.user.ui
    }
}

const action = (mode) =>
    actionBuilder('USER_PROFILE')
        .set('user.ui', mode)
        .dispatch()

export const userDetails = () =>
    action('USER_DETAILS')

export const changePassword = () =>
    action('CHANGE_PASSWORD')

export const closePanel = () =>
    action()

class UserProfile extends React.Component {
    renderButton() {
        const {className, username, ui} = this.props
        const isIdle = !ui
        return (
            <Tooltip msg='home.sections.user.profile' top>
                <button className={className} onClick={() => isIdle ? userDetails() : null}>
                    {username}
                </button>
            </Tooltip>
        )
    }

    render() {
        const showUserDetails = this.props.ui === 'USER_DETAILS'
        const showChangePassword = this.props.ui === 'CHANGE_PASSWORD'
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
    className: PropTypes.string,
    ui: PropTypes.string,
    username: PropTypes.string
}

export default connect(mapStateToProps)(UserProfile)
