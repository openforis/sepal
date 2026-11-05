import moment from 'moment'
import PropTypes from 'prop-types'
import React from 'react'

import api from '~/apiRegistry'
import {compose} from '~/compose'
import {connect} from '~/connect'
import format from '~/format'
import {msg} from '~/translate'
import {Icon} from '~/widget/icon'
import {Scrollable} from '~/widget/scrollable'
import {Tooltip} from '~/widget/tooltip'
import {Widget} from '~/widget/widget'

import {USAGE_COLORS} from './usageColors'
import {UsageMeter} from './usageMeter'
import styles from './usageStatistics.module.css'

const COST_PREFIX = '$ '
const METER_EXAMPLE = {avg: 40, max: 90}

// Resource usage month by month, newest first: every user's summed (admin, global), the given
// user's (admin), or the current user's own when no username is given. Months are UTC calendar months, the ones the budget limits run on;
// hovering one shows its usage per instance type in a tooltip. Types go by their tag ("t1"), as
// everywhere else a user picks one; a type without a tag by its name.
class _UsageStatistics extends React.Component {
    state = {usage: null, failed: false}

    componentDidMount() {
        const {global, username, stream} = this.props
        stream('LOAD_USER_USAGE',
            global
                ? api.sessions.globalUsage$()
                : username
                    ? api.sessions.userUsage$(username)
                    : api.sessions.usage$(),
            usage => this.setState({usage}),
            () => this.setState({failed: true})
        )
    }

    render() {
        const {framed} = this.props
        return (
            <Widget
                label={msg('user.userDetails.form.usage.label')}
                tooltip={this.renderMeterExample()}
                framed={framed}>
                {this.renderContent()}
            </Widget>
        )
    }

    renderMeterExample() {
        return (
            <div className={styles.meterExample}>
                <div>{msg('user.userDetails.form.usage.meterExample')}</div>
                <div className={styles.meterExampleValues}>
                    {msg('user.userDetails.form.usage.meterExampleValues', METER_EXAMPLE)}
                    {this.renderMeter('cpu', METER_EXAMPLE)}
                </div>
            </div>
        )
    }

    renderContent() {
        const {usage, failed} = this.state
        if (failed) {
            return <div className={styles.message}>{msg('user.userDetails.form.usage.error')}</div>
        }
        if (!usage) {
            return <Icon name='spinner'/>
        }
        if (!usage.months.length) {
            return <div className={styles.message}>{msg('user.userDetails.form.usage.noData')}</div>
        }
        return this.renderMonths(usage.months)
    }

    renderMonths(months) {
        return (
            <Scrollable direction='x' containerClassName={styles.months}>
                <table className={styles.table}>
                    {this.renderHeader(msg('user.userDetails.form.usage.month'))}
                    <tbody>
                        {months.map(month => this.renderMonth(month))}
                    </tbody>
                </table>
            </Scrollable>
        )
    }

    renderMonth({month, overall, byInstanceType}) {
        return (
            <Tooltip
                key={month}
                msg={this.renderMonthBreeakdown(byInstanceType)}
                placement='bottom'
                delay={250}
                styles={{root: {pointerEvents: 'none'}, body: {maxWidth: 'none'}}}>
                {this.renderRow(moment.utc(month, 'YYYY-MM').format('MMM YYYY'), overall, {className: styles.month})}
            </Tooltip>
        )
    }

    renderMonthBreeakdown(byInstanceType) {
        return (
            <table className={styles.table}>
                {this.renderHeader(msg('user.userDetails.form.usage.instanceType'))}
                <tbody>
                    {byInstanceType.map(row => this.renderRow(row.tag ?? row.name, row))}
                </tbody>
            </table>
        )
    }

    renderHeader(label) {
        return (
            <thead>
                <tr>
                    <th>{label}</th>
                    <th>{msg('user.userDetails.form.usage.hours')}</th>
                    <th>{msg('user.userDetails.form.usage.cost')}</th>
                    <th className={styles.metric}>{msg('user.userSession.usage.cpu')}</th>
                    <th className={styles.metric}>{msg('user.userSession.usage.ram')}</th>
                    <th className={styles.metric}>{msg('user.userSession.usage.gpu')}</th>
                    <th>{msg('user.userDetails.form.usage.network')}</th>
                </tr>
            </thead>
        )
    }

    renderRow(label, {hours, cost, cpu, ram, gpu, netBytesPerS}, rowProps) {
        return (
            <tr key={label} {...rowProps}>
                <td>{label}</td>
                <td>{hours}</td>
                <td>{cost != null ? format.dollars(cost, {prefix: COST_PREFIX}) : '—'}</td>
                <td>{this.renderMeter('cpu', cpu)}</td>
                <td>{this.renderMeter('ram', ram)}</td>
                <td>{this.renderMeter('gpu', gpu)}</td>
                <td>{netBytesPerS !== null ? `${format.fileSize(netBytesPerS)}/s` : '—'}</td>
            </tr>
        )
    }

    // Average and maximum on one line. A metric that was not measured leaves the bare line.
    renderMeter(key, metric) {
        const label = metric
            ? msg('user.userDetails.form.usage.avgMaxValue', {avg: Math.round(metric.avg), max: Math.round(metric.max)})
            : msg('user.userDetails.form.usage.notAvailable')
        return <UsageMeter value={metric?.avg} tick={metric?.max} color={USAGE_COLORS[key]} label={label}/>
    }
}

export const UsageStatistics = compose(
    _UsageStatistics,
    connect()
)

UsageStatistics.propTypes = {
    framed: PropTypes.any,
    global: PropTypes.any,
    username: PropTypes.string
}
