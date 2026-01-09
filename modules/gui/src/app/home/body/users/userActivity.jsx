import moment from 'moment'
import PropTypes from 'prop-types'
import React from 'react'

import {msg} from '~/translate'
import {Icon} from '~/widget/icon'
import {Tooltip} from '~/widget/tooltip'

export class UserActivity extends React.Component {
    static ACTIVE = 'ACTIVE'
    static INACTIVE_LOW = 'INACTIVE_LOW'
    static INACTIVE_HIGH = 'INACTIVE_HIGH'
    static INACTIVE_UNKNOWN = 'INACTIVE_UNKNOWN'
    static NOTIFIED = 'NOTIFIED'
    static PURGED = 'PURGED'

    render() {
        const {activity: {event, timestamp}} = this.props
        return (
            <Tooltip
                msg={moment(timestamp).fromNow()}
                delay={250}
                placement='topRight'>
                <div style={{display: 'flex', alignItems: 'center', gap: '0.25rem'}}>
                    {this.getIcon(event)}
                    {event ? msg(`user.activity.${event}`) : null}
                </div>
            </Tooltip>
        )
    }

    getIcon(status) {
        switch(status) {
            case UserActivity.ACTIVE:
                return this.getOkIcon()
            case UserActivity.INACTIVE_LOW:
                return this.getInactiveLowIcon()
            case UserActivity.INACTIVE_HIGH:
                return this.getInactiveHighIcon()
            case UserActivity.INACTIVE_UNKNOWN:
                return this.getInactiveUnknownIcon()
            case UserActivity.NOTIFIED:
                return this.getNotifiedIcon()
            case UserActivity.PURGED:
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

UserActivity.propTypes = {
    activity: PropTypes.string
}
