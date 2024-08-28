import PropTypes from 'prop-types'
import React from 'react'

import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {Icon} from '~/widget/icon'

export class UserStatus extends React.Component {
    static LOCKED = 'LOCKED'
    static PENDING = 'PENDING'
    static ACTIVE = 'ACTIVE'

    static isLocked = status =>
        status === UserStatus.LOCKED

    static isPending = status =>
        status === UserStatus.PENDING

    static isActive = status =>
        status === UserStatus.ACTIVE

    render() {
        const {status} = this.props
        return (
            <Button
                chromeless
                shape='none'
                air='none'
                icon={this.getIcon(status)}
                // look={this.getLook(status)}
                // iconVariant={this.getIconVariant(status)}
                // iconDimmed={UserStatus.isLocked(status)}
                label={msg(`user.status.${status}`).toUpperCase()}
            />
        )
    }

    getIcon() {
        const {status, isGoogleUser} = this.props
        switch(status) {
        case UserStatus.LOCKED:
            return this.getLockedUserIcon()
        case UserStatus.PENDING:
            return this.getPendingUserIcon()
        case UserStatus.ACTIVE:
            return isGoogleUser ? this.getConnectedActiveUserIcon() : this.getDisconnectedActiveUserIcon()
        default:
            return this.getUnknownUserIcon()
        }
    }

    getUnknownUserIcon() {
        return <Icon name='question' look='default' variant='normal'/>
    }

    getLockedUserIcon() {
        return <Icon name='lock' look='cancel' variant='normal' dimmed/>
    }

    getPendingUserIcon() {
        return <Icon name='hourglass-half' look='apply' variant='info'/>
    }

    getDisconnectedActiveUserIcon() {
        return <Icon name='user' look='add' variant='success'/>
    }

    getConnectedActiveUserIcon() {
        return <Icon name='google' type='brands' look='add' variant='success'/>
    }
}

UserStatus.defaultProps = {
    status: 'UNKNOWN'
}

UserStatus.propTypes = {
    status: PropTypes.string
}
