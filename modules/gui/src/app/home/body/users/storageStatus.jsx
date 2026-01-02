import PropTypes from 'prop-types'
import React from 'react'

import {msg} from '~/translate'
import {Icon} from '~/widget/icon'

export class StorageStatus extends React.Component {
    static ACTIVE = 'ACTIVE'
    static INACTIVE_LOW = 'INACTIVE_LOW'
    static INACTIVE_HIGH = 'INACTIVE_HIGH'
    static INACTIVE_UNKNOWN = 'INACTIVE_UNKNOWN'
    static NOTIFIED = 'NOTIFIED'
    static PURGED = 'PURGED'

    render() {
        const {status} = this.props
        return (
            <div style={{display: 'flex', alignItems: 'center', gap: '0.25rem'}}>
                {this.getIcon(status)}
                {status ? msg(`user.storageStatus.${status}`) : null}
            </div>
        )
    }

    getIcon(status) {
        switch(status) {
            case StorageStatus.ACTIVE:
                return this.getOkIcon()
            case StorageStatus.INACTIVE_LOW:
                return this.getInactiveLowIcon()
            case StorageStatus.INACTIVE_HIGH:
                return this.getInactiveHighIcon()
            case StorageStatus.INACTIVE_UNKNOWN:
                return this.getInactiveUnknownIcon()
            case StorageStatus.NOTIFIED:
                return this.getNotifiedIcon()
            case StorageStatus.PURGED:
                return this.getPurgedIcon()
            default:
                return this.getUnknownIcon()
        }
    }

    getOkIcon() {
        return <Icon name='check' variant='success'/>
    }

    getInactiveLowIcon() {
        return <Icon name='arrow-down' variant='success'/>
    }

    getInactiveHighIcon() {
        return <Icon name='bell' variant='warning'/>
    }

    getInactiveUnknownIcon() {
        return <Icon name='hourglass-half' variant='success'/>
    }

    getNotifiedIcon() {
        return <Icon name='triangle-exclamation' variant='warning'/>
    }

    getPurgedIcon() {
        return <Icon name='trash-can' type='regular' variant='info'/>
    }

    getUnknownIcon() {
        return null
    }
}

StorageStatus.propTypes = {
    status: PropTypes.string
}
