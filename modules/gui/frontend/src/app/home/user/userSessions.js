import {connect} from 'store'
import {msg} from 'translate'
import React from 'react'
import UserSession from './userSession'
import format from 'format'
import lookStyles from 'style/look.module.css'
import moment from 'moment'
import styles from './userSessions.module.css'

const mapStateToProps = state => {
    return {
        sessions: (state.user && state.user.currentUserReport && state.user.currentUserReport.sessions) || [],
        selectedSession: state.ui && state.ui.selectedSession
    }
}

class UserSessions extends React.Component {
    state = {
        selectedSession: null,
        clean: true
    }

    setSelectedSession(selectedSession) {
        this.setState(prevState => ({
            ...prevState,
            selectedSession,
            clean: prevState.clean || !selectedSession
        }))
    }

    setUnclean() {
        this.setState(prevState => ({
            ...prevState,
            clean: false
        }))
    }

    editSessionDetails(sessionId) {
        if (this.state.clean) {
            this.setSelectedSession(sessionId)
        }
    }

    closeSessionDetails() {
        this.setSelectedSession()
    }

    renderNoSessions() {
        return (
            <div>{msg('user.report.sessions.noSessions')}</div>
        )
    }

    renderSession(session) {
        const {selectedSession, clean} = this.state
        const selectable = selectedSession !== session.id && clean
        return (
            <div
                key={session.id}
                className={[styles.session, lookStyles.look, lookStyles.transparent].join(' ')}
                onClick={() => selectable ? this.editSessionDetails(session.id) : null}>
                <div className={styles.header}>
                    <span className={'itemType'}>
                        {moment.utc(session.creationTime).fromNow()}
                    </span>
                    <span className={styles.cost}>
                        {format.dollars(session.costSinceCreation)} ({format.dollarsPerHour(session.instanceType.hourlyCost)})
                    </span>
                </div>
                <div>{session.instanceType.name} ({session.instanceType.description})</div>
                {selectedSession === session.id
                    ? <UserSession
                        session={session}
                        onDirty={() => this.setUnclean()}
                        onClose={() => this.closeSessionDetails()}/>
                    : null}
            </div>
        )
    }

    renderSessions(sessions) {
        return (
            <div>
                {sessions.map(session => this.renderSession(session))}
            </div>
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

export default connect(mapStateToProps)(UserSessions)
