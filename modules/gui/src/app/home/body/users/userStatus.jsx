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
        const {status = 'UNKNOWN', label} = this.props
        return (
            <Button
                chromeless
                shape='none'
                air='none'
                icon={this.getIcon(status)}
                label={label && msg(`user.status.${status}`).toUpperCase()}
            />
        )
    }

    getIcon(status) {
        const {googleUser} = this.props
        switch(status) {
            case UserStatus.LOCKED:
                return this.getLockedUserIcon()
            case UserStatus.PENDING:
                return this.getPendingUserIcon()
            case UserStatus.ACTIVE:
                return googleUser ? this.getConnectedActiveUserIcon() : this.getDisconnectedActiveUserIcon()
            default:
                return this.getUnknownUserIcon()
        }
    }

    getUnknownUserIcon() {
        return <Icon name='question' variant='normal'/>
    }

    getLockedUserIcon() {
        return <Icon name='lock' variant='normal' dimmed/>
    }

    getPendingUserIcon() {
        return <Icon name='hourglass-half' variant='info'/>
    }

    getDisconnectedActiveUserIcon() {
        return <Icon name='user' variant='success'/>
    }

    getConnectedActiveUserIcon() {
        return <Icon name='google' type='brands' variant='success'/>
    }
}

UserStatus.propTypes = {
    googleUser: PropTypes.any,
    status: PropTypes.string
}
