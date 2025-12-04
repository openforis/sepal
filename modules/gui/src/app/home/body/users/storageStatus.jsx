import PropTypes from 'prop-types'
import React from 'react'

import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {Icon} from '~/widget/icon'

export class StorageStatus extends React.Component {
    static ACTIVE = 'ACTIVE'
    static INACTIVE = 'INACTIVE'
    static NOTIFIED = 'NOTIFIED'
    static ERASED = 'ERASED'

    // static isActive = status =>
    //     status === StorageStatus.ACTIVE

    // static isInactive = status =>
    //     status === StorageStatus.INACTIVE

    // static isNotified = status =>
    //     status === StorageStatus.NOTIFIED

    // static isErased = status =>
    //     status === StorageStatus.ERASED

    render() {
        const {status} = this.props
        return (
            <Button
                chromeless
                shape='none'
                air='none'
                icon={this.getIcon(status)}
                label={status ? msg(`user.storageStatus.${status}`).toUpperCase() : null}
            />
        )
    }

    getIcon(status) {
        switch(status) {
            case StorageStatus.ACTIVE:
                return this.getActiveIcon()
            case StorageStatus.INACTIVE:
                return this.getInactiveIcon()
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

    getInactiveIcon() {
        return <Icon name='clock' type='regular' variant='warning'/>
    }

    getNotifiedIcon() {
        return <Icon name='clock' type='regular' variant='error'/>
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
