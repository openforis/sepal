import PropTypes from 'prop-types'
import React from 'react'

import api from '~/apiRegistry'
import {compose} from '~/compose'
import {connect} from '~/connect'
import format from '~/format'
import {msg} from '~/translate'
import {Icon} from '~/widget/icon'

import styles from './usageStatistics.module.css'

export const USAGE_DAYS = 30

// Resource usage per instance type over the last USAGE_DAYS days: the given user's (admin), or the
// current user's own when no username is given.
class _UsageStatistics extends React.Component {
    state = {usage: null, failed: false}

    componentDidMount() {
        const {username, stream} = this.props
        stream('LOAD_USER_USAGE',
            username
                ? api.sessions.userUsage$(username, USAGE_DAYS)
                : api.sessions.usage$(USAGE_DAYS),
            usage => this.setState({usage}),
            () => this.setState({failed: true})
        )
    }

    render() {
        const {usage, failed} = this.state
        if (failed) {
            return <div className={styles.message}>{msg('user.userDetails.form.usage.error')}</div>
        }
        if (!usage) {
            return <Icon name='spinner'/>
        }
        if (!usage.overall) {
            return <div className={styles.message}>{msg('user.userDetails.form.usage.noData')}</div>
        }
        return this.renderTable(usage)
    }

    renderTable({overall, byInstanceType}) {
        const hasGpu = byInstanceType.some(({gpu}) => gpu)
        return (
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th>{msg('user.userDetails.form.usage.instanceType')}</th>
                        <th>{msg('user.userDetails.form.usage.hours')}</th>
                        <th>{msg('user.userDetails.form.usage.cost')}</th>
                        <th>{avgMaxHeader(msg('user.userSession.usage.cpu'))}</th>
                        <th>{avgMaxHeader(msg('user.userSession.usage.ram'))}</th>
                        {hasGpu ? <th>{avgMaxHeader(msg('user.userSession.usage.gpu'))}</th> : null}
                        <th>{msg('user.userDetails.form.usage.network')}</th>
                    </tr>
                </thead>
                <tbody>
                    {byInstanceType.map(row => this.renderRow(row.name, row, hasGpu))}
                    {byInstanceType.length > 1
                        ? this.renderRow(msg('user.userDetails.form.usage.overall'), overall, hasGpu, styles.total)
                        : null}
                </tbody>
            </table>
        )
    }

    renderRow(label, {hours, cost, cpu, ram, gpu, netBytesPerS}, hasGpu, className) {
        // avg/max in one cell: "12% / 96%"
        const avgMax = metric => metric ? `${Math.round(metric.avg)}% / ${Math.round(metric.max)}%` : '—'
        return (
            <tr key={label} className={className}>
                <td>{label}</td>
                <td>{hours}</td>
                <td>{cost != null ? format.dollars(cost) : '—'}</td>
                <td>{avgMax(cpu)}</td>
                <td>{avgMax(ram)}</td>
                {hasGpu ? <td>{avgMax(gpu)}</td> : null}
                <td>{netBytesPerS !== null ? `${format.fileSize(netBytesPerS)}/s` : '—'}</td>
            </tr>
        )
    }
}

const avgMaxHeader = metric =>
    msg('user.userDetails.form.usage.avgMax', {metric})

export const UsageStatistics = compose(
    _UsageStatistics,
    connect()
)

UsageStatistics.propTypes = {
    username: PropTypes.string
}
