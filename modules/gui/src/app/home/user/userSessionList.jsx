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

import {InstanceSpecsTag} from '../instanceSpecs'
import styles from './userSessionList.module.css'
import {instanceTypeLabel, runningItems, usageMetrics, verdictOf} from './userSessionSummary'

const mapStateToProps = () => ({
    sessions: select('user.currentUserReport.sessions')
})

class _UserSessionList extends React.Component {
    stopSession(session) {
        const {stream} = this.props
        stream('STOP_USER_SESSION_' + session.id,
            stopCurrentUserSession$(session),
            // no success toast — the session leaves the list (and its app tabs close)
            null,
            error => Notifications.error({message: msg('user.userSession.stop.error'), error})
        )
    }

    isStoppingSession(session) {
        const {stream} = this.props
        return stream('STOP_USER_SESSION_' + session.id).active
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

    // The name is the one the expiry notification, the email and its management page use.
    renderTitle(session) {
        const {name, instanceType} = session
        return (
            <div className={styles.title}>
                {name ? <span>{name}</span> : null}
                <div className={styles.type}>
                    <span>{instanceTypeLabel(session)}</span>
                    <InstanceSpecsTag instanceType={instanceType} compact/>
                </div>
            </div>
        )
    }

    renderDescription(session) {
        const apps = runningItems(session)
        return apps.length
            ? apps.map(({label}) => label).join(' · ')
            : null
    }

    // The row says who the instance is and what runs on it; what it is doing and when it expires sit
    // underneath as a strip of labelled values, so neither has to be read out of a sentence.
    renderStats(session) {
        return (
            <div className={styles.stats}>
                {this.renderUsage(session)}
                {this.renderVerdict(session)}
                {this.renderCost(session)}
                {this.renderDeadline(session)}
            </div>
        )
    }

    renderUsage(session) {
        const metrics = usageMetrics(session)
        return metrics
            ? metrics.map(metric => this.renderMetric(metric))
            : this.renderStat({
                key: 'usage',
                label: msg('user.userSession.usage.label'),
                value: msg('user.userSession.usage.none')
            })
    }

    renderMetric({key, pct, bytesPerS}) {
        return this.renderStat({
            key,
            label: msg(`user.userSession.usage.${key}`),
            value: key === 'net'
                ? format.fileSize(bytesPerS, {unit: 'B/s'})
                : `${Math.round(pct)}%`
        })
    }

    // The verdict is the one the busy ratchet acts on, so "unused" here is the reason the instance
    // will be stopped, not a second opinion.
    renderVerdict(session) {
        const verdict = verdictOf(session)
        return verdict
            ? this.renderStat({
                key: 'verdict',
                label: msg('user.userSession.verdict.label'),
                value: msg(`user.userSession.verdict.${verdict}`),
                warning: verdict === 'unused'
            })
            : null
    }

    renderCost(session) {
        return this.renderStat({
            key: 'cost',
            label: msg('user.report.sessions.cost'),
            value: format.dollars(session.costSinceCreation)
        })
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
        return (
            <React.Fragment>
                {this.renderStat({
                    key: 'deadline',
                    label: msg('user.userSession.deadline.label'),
                    value: msg('user.userSession.deadline.value', {
                        time: deadline.format('LT'),
                        relative: deadline.fromNow()
                    })
                })}
                {closeTime
                    ? this.renderStat({
                        key: 'close',
                        label: msg('user.userSession.deadline.stopping'),
                        value: moment(closeTime).format('LT'),
                        warning: true
                    })
                    : null}
            </React.Fragment>
        )
    }

    renderStat({key, label, value, warning}) {
        return (
            <div key={key} className={[styles.stat, warning ? styles.warning : null].join(' ')}>
                <div className={styles.label}>{label}</div>
                <div>{value}</div>
            </div>
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

    // The confirmation names the instance being lost, by the same two-word name the list, the SSH
    // menu and the expiry notification use. An instance predating names has none, and falls back to
    // its type, as the list titles it.
    renderRemoveMessage(session) {
        const running = runningItems(session).length
        return msg(
            running ? 'user.userSession.stop.messageWithRunning' : 'user.userSession.stop.message',
            {name: session.name || instanceTypeLabel(session)}
        )
    }

    renderSession(session) {
        return (
            <ListItem
                key={session.id}
                expansion={this.renderStats(session)}
                expansionClassName={styles.expansion}
                expanded>
                <CrudItem
                    title={this.renderTitle(session)}
                    description={this.renderDescription(session)}
                    timestamp={session.creationTime}
                    editTooltip={msg('user.userSession.update.tooltip')}
                    editDisabled={this.isStoppingSession(session)}
                    copyValue={session.sshLogin}
                    copyTooltip={msg('user.userSession.sshLogin.tooltip', {login: session.sshLogin})}
                    copyDisabled={!session.sshLogin || this.isStoppingSession(session)}
                    removeMessage={this.renderRemoveMessage(session)}
                    removeContent={this.renderRunning(session)}
                    removeTooltip={msg('user.userSession.stop.tooltip')}
                    removePending={this.isStoppingSession(session)}
                    onEdit={() => this.selectSession(session)}
                    onRemove={() => this.stopSession(session)}
                />
            </ListItem>
        )
    }

    renderSessions(sessions) {
        return (
            <Layout spacing='tight' type='vertical'>
                {sessions.map(session => this.renderSession(session))}
            </Layout>
        )
    }

    render() {
        const {sessions} = this.props
        return sessions?.length
            ? this.renderSessions(sessions)
            : this.renderNoSessions()
    }
}

export const UserSessionList = compose(
    _UserSessionList,
    connect(mapStateToProps)
)

UserSessionList.propTypes = {}
