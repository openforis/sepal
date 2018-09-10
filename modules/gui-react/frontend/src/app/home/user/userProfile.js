import PropTypes from 'prop-types'
import React from 'react'
import Tooltip from 'widget/tooltip'
import UserProfilePanel from './userDetails'
import {connect} from 'store'

const mapStateToProps = (state) => {
    const user = state.user.currentUser
    return {
        username: user.username,
    }
}

class UserProfile extends React.Component {
    state = {
        open: false
    }

    open() {
        this.setState(prevState => ({...prevState, open: true}))
    }

    close() {
        this.setState(prevState => ({...prevState, open: false}))
    }

    renderButton() {
        const {className, username} = this.props
        return (
            <Tooltip msg='home.sections.user.profile' top>
                <button className={className} onClick={() => this.open()}>
                    {username}
                </button>
            </Tooltip>
        )
    }

    render() {
        const {open} = this.state
        return (
            <React.Fragment>
                {this.renderButton()}
                {open ? <UserProfilePanel close={() => this.close()}/> : null}
            </React.Fragment>
        )
    }
}

UserProfile.propTypes = {
    className: PropTypes.string
}

export default connect(mapStateToProps)(UserProfile)
