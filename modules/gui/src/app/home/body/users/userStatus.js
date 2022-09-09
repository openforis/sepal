import {Button} from 'widget/button'
import {msg} from 'translate'
import PropTypes from 'prop-types'
import React from 'react'

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
        const {status = 'UNKNOWN'} = this.props
        return (
            <Button
                chromeless
                shape='none'
                air='none'
                look={this.getLook(status)}
                icon={this.getIcon(status)}
                iconVariant={this.getIconVariant(status)}
                iconDimmed={UserStatus.isLocked(status)}
                label={msg(`user.status.${status}`).toUpperCase()}
            />
        )
    }

    getLook(status) {
        switch(status) {
        case UserStatus.LOCKED: return 'cancel'
        case UserStatus.PENDING: return 'apply'
        case UserStatus.ACTIVE: return 'add'
        }
        return 'default'
    }

    getIcon(status) {
        switch(status) {
        case UserStatus.LOCKED: return 'lock'
        case UserStatus.PENDING: return 'pause'
        case UserStatus.ACTIVE: return 'play'
        }
        return 'question'
    }

    getIconVariant(status) {
        switch(status) {
        case UserStatus.LOCKED: return 'normal'
        case UserStatus.PENDING: return 'info'
        case UserStatus.ACTIVE: return 'success'
        }
        return 'normal'
    }
}

UserStatus.propTypes = {
    status: PropTypes.string
}
