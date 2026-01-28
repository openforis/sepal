import moment from 'moment'
import PropTypes from 'prop-types'
import React from 'react'

import api from '~/apiRegistry'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {msg} from '~/translate'
import {Icon} from '~/widget/icon'
import {Layout} from '~/widget/layout'
import {Tooltip} from '~/widget/tooltip'

const getUserEvents$ = username =>
    api.userStorage.getUserEvents$(username)

const ACTIVE = 'ACTIVE'
const INACTIVE_LOW = 'INACTIVE_LOW'
const INACTIVE_HIGH = 'INACTIVE_HIGH'
const INACTIVE_UNKNOWN = 'INACTIVE_UNKNOWN'
const NOTIFIED = 'NOTIFIED'
const PURGED = 'PURGED'

class _UserActivity extends React.Component {

    state = {
        events: null
    }

    loadHistory() {
        const {user: {username}, stream} = this.props
        stream('LOAD_USER_EVENTS',
            getUserEvents$(username),
            events => this.setState({events})
        )
    }

    onTooltipVisible(visible) {
        const {events} = this.state
        visible && !events && this.loadHistory()
    }

    render() {
        return (
            <Tooltip
                msg={this.renderHistory()}
                onVisibleChange={visible => this.onTooltipVisible(visible)}
                delay={250}
                placement='bottomLeft'>
                {this.renderCurrent()}
            </Tooltip>
        )
    }

    renderCurrent() {
        const {user: {activity: {event}}} = this.props
        return (
            <div style={{display: 'flex', alignItems: 'center', gap: '.25rem'}}>
                {this.getIcon(event)}
                {event ? msg(`user.activity.${event}`) : null}
            </div>
        )
    }

    renderHistory() {
        return (
            <div style={{display: 'flex', flexDirection: 'column', gap: '.5rem'}}>
                {this.renderEvents()}
            </div>
        )
    }

    renderEvents() {
        const {events} = this.state
        return events
            ? events.map(({event, timestamp}, index) => this.renderEvent({event, timestamp, index}))
            : this.renderCurrent()
    }

    renderEvent({event, timestamp, index}) {
        return (
            <Layout key={index} type='horizontal-nowrap' alignment='spaced'>
                <div style={{display: 'flex', alignItems: 'center', gap: '.25rem'}}>
                    {this.getIcon(event)}
                    {event ? msg(`user.activity.${event}`) : null}
                </div>
                <div style={{display: 'flex', alignItems: 'center', gap: '.25rem'}}>
                    {timestamp ? moment(timestamp).format('LLL') : null}
                </div>
            </Layout>
        )
    }

    getIcon(status) {
        switch(status) {
            case ACTIVE:
                return this.getOkIcon()
            case INACTIVE_LOW:
                return this.getInactiveLowIcon()
            case INACTIVE_HIGH:
                return this.getInactiveHighIcon()
            case INACTIVE_UNKNOWN:
                return this.getInactiveUnknownIcon()
            case NOTIFIED:
                return this.getNotifiedIcon()
            case PURGED:
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

export const UserActivity = compose(
    _UserActivity,
    connect()
)

UserActivity.propTypes = {
    user: PropTypes.any
}
