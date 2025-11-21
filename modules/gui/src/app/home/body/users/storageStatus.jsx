import PropTypes from 'prop-types'
import React from 'react'

import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {Icon} from '~/widget/icon'

export class StorageStatus extends React.Component {
    static ACTIVE = 'ACTIVE'
    static NOTIFIED = 'NOTIFIED'
    static ERASED = 'ERASED'

    static isActive = status =>
        status === StorageStatus.ACTIVE

    static isNotified = status =>
        status === StorageStatus.NOTIFIED

    static isErased = status =>
        status === StorageStatus.ERASED

    render() {
        const {status = 'UNKNOWN'} = this.props
        return (
            <Button
                chromeless
                shape='none'
                air='none'
                icon={this.getIcon(status)}
                label={msg(`user.storageStatus.${status}`).toUpperCase()}
            />
        )
    }

    getIcon(status) {
        switch(status) {
            case StorageStatus.ACTIVE:
                return this.getActiveIcon()
            case StorageStatus.NOTIFIED:
                return this.getNotifiedIcon()
            case StorageStatus.ERASED:
                return this.getErasedIcon()
            default:
                return this.getUnknownIcon()
        }
    }

    getActiveIcon() {
        return <Icon name='check' variant='success'/>
    }

    getNotifiedIcon() {
        return <Icon name='hourglass-half' variant='warning'/>
    }

    getErasedIcon() {
        return <Icon name='trash' variant='info'/>
    }

    getUnknownIcon() {
        return <Icon name='question' variant='normal'/>
    }
}

StorageStatus.propTypes = {
    status: PropTypes.string
}
