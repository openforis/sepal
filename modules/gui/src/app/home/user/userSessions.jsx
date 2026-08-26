import moment from 'moment'
import React from 'react'

import {actionBuilder} from '~/action-builder'
import {compose} from '~/compose'
import {connect} from '~/connect'
import format from '~/format'
import {select} from '~/store'
import {msg} from '~/translate'
import {stopCurrentUserSession$} from '~/user'
import {CrudItem} from '~/widget/crudItem'
import {Layout} from '~/widget/layout'
import {ListItem} from '~/widget/listItem'
import {NoData} from '~/widget/noData'
import {Notifications} from '~/widget/notifications'
import {Scrollable} from '~/widget/scrollable'

import styles from './userSessions.module.css'
import {instanceLabel, runningItems, usageMetrics, verdictOf} from './userSessionSummary'

const mapStateToProps = () => ({
    sessions: select('user.currentUserReport.sessions')
})

class _UserSessions extends React.Component {
    stopSession(session) {
        const {stream} = this.props
        stream('STOP_USER_SESSION',
            stopCurrentUserSession$(session),
            // no success toast — the session leaves the list (and its app tabs close)
            null,
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

    // The number is the instance's 1-based position in this list — the same one the SSH menu prints
    // and the expiry notification quotes, because the report is ordered by creation time.
    renderTitle(session, index) {
        const {hourlyCost} = session.instanceType
        return `${instanceLabel(session, index)} (${format.dollarsPerHour(hourlyCost)})`
    }

    renderMetric({key, pct, bytesPerS}) {
        const label = msg(`user.userSession.usage.${key}`)
        return key === 'net'
            ? `${label} ${format.fileSize(bytesPerS, {unit: 'B/s'})}`
            : `${label} ${Math.round(pct)}%`
    }

    // What the instance is doing, and what the sampler makes of it. The verdict is the one the busy
    // ratchet acts on, so "unused" here is the reason the instance will be stopped, not a
    // second opinion.
    renderUsage(session) {
        const metrics = usageMetrics(session)
        const verdict = verdictOf(session)
        const usage = metrics
            ? metrics.map(metric => this.renderMetric(metric)).join(' · ')
            : msg('user.userSession.usage.none')
        return [usage, verdict && msg(`user.userSession.verdict.${verdict}`)]
            .filter(Boolean)
            .join(' — ')
    }

    // The stored deadline, absolute and relative. Under enforcement a notified session also has a
    // close time; in notify mode closeTime is null, where a countdown to a close that will not
    // happen would be a lie.
    renderDeadline(session) {
        const {timeoutTime, closeTime} = session.expiry || {}
        if (!timeoutTime) {
            return null
        }
        const deadline = moment(timeoutTime)
        return [
            msg('user.userSession.deadline.until', {
                time: deadline.format('LT'),
                relative: deadline.fromNow()
            }),
            closeTime && msg('user.userSession.deadline.stopping', {
                time: moment(closeTime).format('LT')
            })
        ].filter(Boolean).join(' — ')
    }

    renderDescription(session) {
        const deadline = this.renderDeadline(session)
        const apps = runningItems(session)
        return (
            <React.Fragment>
                <div>{this.renderUsage(session)}</div>
                {deadline ? <div>{deadline}</div> : null}
                {apps.length
                    ? (
                        <ul className={styles.apps}>
                            {apps.map(({key, label}) => <li key={key}>{label}</li>)}
                        </ul>
                    )
                    : null}
            </React.Fragment>
        )
    }

    // The stop confirmation lists the same things, so what a user is about to lose is described
    // identically to what the list says is running.
    renderRunning(session) {
        const running = runningItems(session)
        return running.length
            ? (
                <ul>
                    {running.map(({key, label}) =>
                        <li key={key}>{label}</li>
                    )}
                </ul>
            )
            : null
    }

    renderSession(session, index) {
        const running = runningItems(session).length
        return (
            <ListItem key={session.id}>
                <CrudItem
                    title={this.renderTitle(session, index)}
                    titleTooltip={session.instanceType.description}
                    description={this.renderDescription(session)}
                    timestamp={session.creationTime}
                    timestampFootnote={format.dollars(session.costSinceCreation)}
                    editTooltip={msg('user.userSession.update.tooltip')}
                    removeMessage={msg(running ? 'user.userSession.stop.messageWithRunning' : 'user.userSession.stop.message')}
                    removeContent={this.renderRunning(session)}
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
                <Layout spacing='tight' type='vertical'>
                    {sessions.map((session, index) => this.renderSession(session, index))}
                </Layout>
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
