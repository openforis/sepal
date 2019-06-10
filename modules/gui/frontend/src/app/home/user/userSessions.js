import {Button, ButtonGroup} from 'widget/button'
import {Scrollable, ScrollableContainer} from 'widget/scrollable'
import {compose} from 'compose'
import {connect, select} from 'store'
import {msg} from 'translate'
import {stopCurrentUserSession$} from 'widget/user'
import Notifications from 'widget/notifications'
import React from 'react'
import RemoveButton from 'widget/removeButton'
import actionBuilder from 'action-builder'
import format from 'format'
import lookStyles from 'style/look.module.css'
import moment from 'moment'
import styles from './userSessions.module.css'

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

    renderControls(session) {
        return (
            <React.Fragment>
                <ButtonGroup>
                    <Button
                        chromeless
                        shape='circle'
                        size='large'
                        icon='edit'
                        tooltip={msg('user.userSession.update.tooltip')}
                        onClick={() => this.selectSession(session)}
                    />
                    <RemoveButton
                        tooltip={msg('user.userSession.stop.tooltip')}
                        message={msg('user.userSession.stop.message')}
                        onRemove={() => this.stopSession(session)}
                    />
                </ButtonGroup>
            </React.Fragment>
        )
    }

    renderSession(session) {
        return (
            <div
                key={session.id}
                className={[lookStyles.look, lookStyles.transparent].join(' ')}
                onClick={() => this.selectSession(session)}>
                <div className={styles.header}>
                    <span className={'itemType'}>
                        {session.instanceType.name} ({session.instanceType.description})
                    </span>
                    {this.renderControls(session)}
                </div>
                <div className={styles.info}>
                    <span className={styles.cost}>
                        {this.renderCost(session)} ({this.renderHourlyCost(session)})
                    </span>
                    <span>
                        {moment.utc(session.creationTime).fromNow()}
                    </span>
                </div>
            </div>
        )
    }

    renderSessions(sessions) {
        return (
            <ScrollableContainer className={styles.sessions}>
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
