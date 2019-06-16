import {Scrollable, ScrollableContainer} from 'widget/scrollable'
import {compose} from 'compose'
import {connect, select} from 'store'
import {msg} from 'translate'
import {stopCurrentUserSession$} from 'widget/user'
import Notifications from 'widget/notifications'
import React from 'react'
import SuperButton from 'widget/superButton'
import actionBuilder from 'action-builder'
import format from 'format'

const mapStateToProps = () => ({
    sessions: select('user.currentUserReport.sessions')
})

class UserSessions extends React.Component {
    stopSession(session) {
        const {stream, onClose} = this.props
        stream('STOP_USER_SESSION',
            stopCurrentUserSession$(session),
            () => {
                Notifications.success({message: msg('user.userSession.stop.success')})
                onClose()
            },
            error => Notifications.error({message: msg('user.userSession.stop.error'), error})
        )
    }

    selectSession(session) {
        actionBuilder('SELECT_SESSION', {session})
            .set('ui.selectedSessionId', session.id)
            .dispatch()
    }

    renderNoSessions() {
        return (
            <div>{msg('user.report.sessions.noSessions')}</div>
        )
    }

    renderCost(session) {
        return format.dollars(session.costSinceCreation)
    }

    renderHourlyCost(session) {
        return format.dollarsPerHour(session.instanceType.hourlyCost)
    }

    renderSession(session) {
        const title = `${session.instanceType.name} (${session.instanceType.description})`
        const description = `${this.renderCost(session)} (${this.renderHourlyCost(session)})`
        return (
            <SuperButton
                key={session.id}
                title={title}
                description={description}
                timestamp={session.creationTime}
                editTooltip={msg('user.userSession.update.tooltip')}
                removeMessage={msg('user.userSession.stop.message')}
                removeTooltip={msg('user.userSession.stop.tooltip')}
                onEdit={() => this.selectSession(session)}
                onRemove={() => this.stopSession(session)}
            />
        )
    }

    renderSessions(sessions) {
        return (
            <ScrollableContainer>
                <Scrollable>
                    {sessions.map(session => this.renderSession(session))}
                </Scrollable>
            </ScrollableContainer>
        )
    }

    render() {
        const {sessions} = this.props
        return sessions.length
            ? this.renderSessions(sessions)
            : this.renderNoSessions()
    }
}

UserSessions.propTypes = {}

export default compose(
    UserSessions,
    connect(mapStateToProps)
)
