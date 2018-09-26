import {connect} from 'store'
import {msg} from 'translate'
import React from 'react'
import UserSession from './userSession'
import format from 'format'
import styles from './userSessions.module.css'

const mapStateToProps = (state) => {
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
            <React.Fragment key={session.id}>
                <tr className={selectable ? styles.clickable : null}
                    onClick={() => selectable ? this.editSessionDetails(session.id) : null}>
                    <td>{session.instanceType.name}</td>
                    <td>{session.instanceType.description}</td>
                    <td>{format.fullDateTime(session.creationTime)}</td>
                    <td className={styles.number}>{format.dollars(session.costSinceCreation)}</td>
                    <td className={styles.number}>{format.dollarsPerHour(session.instanceType.hourlyCost)}</td>
                    <td className={styles.number}>{format.hours(session.earliestTimeoutHours)}</td>
                </tr>
                {selectedSession === session.id
                    ? <tr>
                        <td colSpan={6}>
                            <UserSession
                                session={session}
                                onDirty={() => this.setUnclean()}
                                onClose={() => this.closeSessionDetails()}/>
                        </td>
                    </tr>
                    : null}
            </React.Fragment>
        )
    }

    renderSessions(sessions) {
        return (
            <table className={styles.sessions}>
                <thead>
                    <tr>
                        <th>{msg('user.report.sessions.instanceType')}</th>
                        <th>{msg('user.report.sessions.instanceDescription')}</th>
                        <th>{msg('user.report.sessions.time')}</th>
                        <th className={styles.number}>{msg('user.report.sessions.cost')}</th>
                        <th className={styles.number}>{msg('user.report.sessions.hourlyCost')}</th>
                        <th className={styles.number}>{msg('user.report.sessions.earliestTimeoutHours')}</th>
                    </tr>
                </thead>
                <tbody>
                    {sessions.map(session => this.renderSession(session))}
                </tbody>
            </table>
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
