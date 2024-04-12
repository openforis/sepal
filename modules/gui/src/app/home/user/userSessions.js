import {CrudItem} from '~/widget/crudItem'
import {ListItem} from '~/widget/listItem'
import {NoData} from '~/widget/noData'
import {Notifications} from '~/widget/notifications'
import {Scrollable} from '~/widget/scrollable'
import {actionBuilder} from '~/action-builder'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {msg} from '~/translate'
import {select} from '~/store'
import {stopCurrentUserSession$} from '~/user'
import React from 'react'
import format from '~/format'

const mapStateToProps = () => ({
    sessions: select('user.currentUserReport.sessions')
})

class _UserSessions extends React.Component {
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
            <NoData message={msg('user.report.sessions.noSessions')}/>
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
            <ListItem key={session.id}>
                <CrudItem
                    title={title}
                    description={description}
                    timestamp={session.creationTime}
                    editTooltip={msg('user.userSession.update.tooltip')}
                    removeMessage={msg('user.userSession.stop.message')}
                    removeTooltip={msg('user.userSession.stop.tooltip')}
                    onEdit={() => this.selectSession(session)}
                    onRemove={() => this.stopSession(session)}
                />
            </ListItem>
        )
    }

    renderSessions(sessions) {
        return (
            <Scrollable direction='y'>
                {sessions.map(session => this.renderSession(session))}
            </Scrollable>
        )
    }

    render() {
        const {sessions} = this.props
        return sessions?.length
            ? this.renderSessions(sessions)
            : this.renderNoSessions()
    }
}

export const UserSessions = compose(
    _UserSessions,
    connect(mapStateToProps)
)

UserSessions.propTypes = {}
