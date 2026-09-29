import _ from 'lodash'
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
import {instanceTypeLabel, runningItems, usageMetrics} from './userSessionSummary'

// A GPU column on every strip, whether or not the instance has one, so the columns line up.
const USAGE_METRICS = ['cpu', 'gpu', 'ram', 'net']

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

    // While Stop all runs, every session is on its way out, so none of them can be used either.
    isStoppingSession(session) {
        const {stoppingAll, stream} = this.props
        return stoppingAll || stream('STOP_USER_SESSION_' + session.id).active
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
    // underneath as a strip of labelled values, so neither has to be read out of a sentence. Every
    // strip has the same columns, with a dash for what a session has no value for, so the values line
    // up from one session to the next.
    renderStats(session) {
        return (
            <div className={styles.stats}>
                {this.renderUsage(session)}
                {this.renderCost(session)}
                {this.renderDeadline(session)}
                {this.renderClose(session)}
            </div>
        )
    }

    renderUsage(session) {
        const metrics = _.keyBy(usageMetrics(session), 'key')
        return USAGE_METRICS.map(key =>
            this.renderStat({
                key,
                label: msg(`user.userSession.usage.${key}`),
                value: metrics[key] ? this.formatMetric(metrics[key]) : null,
                numeric: true
            })
        )
    }

    formatMetric({key, pct, bytesPerS}) {
        return key === 'net'
            ? format.fileSize(bytesPerS, {unit: 'B/s'})
            : `${Math.round(pct)}%`
    }

    renderCost(session) {
        return this.renderStat({
            key: 'cost',
            label: msg('user.report.sessions.cost'),
            value: format.dollars(session.costSinceCreation),
            numeric: true
        })
    }

    // The stored deadline, absolute and relative. Once passed, the instance is up for stopping, and
    // "expired" says so where "3 minutes ago" would read as a keep-alive still running.
    renderDeadline(session) {
        const {timeoutTime} = session.expiry || {}
        const deadline = timeoutTime ? moment(timeoutTime) : null
        const expired = deadline?.isSameOrBefore(moment())
        return this.renderStat({
            key: 'deadline',
            label: msg('user.userSession.deadline.label'),
            value: deadline
                ? expired
                    ? msg('user.userSession.deadline.expired', {time: deadline.format('LT')})
                    : msg('user.userSession.deadline.value', {time: deadline.format('LT'), relative: deadline.fromNow()})
                : null,
            warning: expired
        })
    }

    // Under enforcement a notified session also has a close time; in notify mode closeTime is null,
    // where a countdown to a close that will not happen would be a lie.
    renderClose(session) {
        const {closeTime} = session.expiry || {}
        return this.renderStat({
            key: 'close',
            label: msg('user.userSession.deadline.stopping'),
            value: closeTime ? moment(closeTime).format('LT') : null,
            warning: !!closeTime
        })
    }

    renderStat({key, label, value, numeric, warning}) {
        const className = [styles.stat, numeric ? styles.numeric : null, warning ? styles.warning : null]
        return (
            <div key={key} className={className.join(' ')}>
                <div className={styles.label}>{label}</div>
                <div>{value ?? '—'}</div>
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
