import moment from 'moment'
import PropTypes from 'prop-types'
import React from 'react'

import api from '~/apiRegistry'
import {compose} from '~/compose'
import {connect} from '~/connect'
import format from '~/format'
import {msg} from '~/translate'
import {FloatingBox} from '~/widget/floatingBox'
import {Icon} from '~/widget/icon'
import {Widget} from '~/widget/widget'

import styles from './usageStatistics.module.css'

// Resource usage month by month, newest first: the given user's (admin), or the current user's own
// when no username is given. Months are UTC calendar months, the ones the budget limits run on;
// hovering one shows its usage per instance type in a box below it. Types go by their tag ("t1"), as everywhere else
// a user picks one; a type without a tag by its name.
class _UsageStatistics extends React.Component {
    // hovered: the month row under the pointer, {month, element}
    state = {usage: null, failed: false, hovered: null}

    constructor(props) {
        super(props)
        this.unhover = this.unhover.bind(this)
    }

    componentDidMount() {
        const {username, stream} = this.props
        stream('LOAD_USER_USAGE',
            username
                ? api.sessions.userUsage$(username)
                : api.sessions.usage$(),
            usage => this.setState({usage}),
            () => this.setState({failed: true})
        )
    }

    render() {
        const {framed} = this.props
        return (
            <Widget label={msg('user.userDetails.form.usage.label')} framed={framed}>
                {this.renderContent()}
                {this.renderHoveredMonth()}
            </Widget>
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
        const hasGpu = months.some(({overall: {gpu}}) => gpu)
        return (
            <table className={styles.table}>
                {this.renderHeader(msg('user.userDetails.form.usage.month'), hasGpu)}
                <tbody>
                    {months.map(month => this.renderMonth(month, hasGpu))}
                </tbody>
            </table>
        )
    }

    renderMonth(month, hasGpu) {
        return this.renderRow(moment.utc(month.month, 'YYYY-MM').format('MMM YYYY'), month.overall, hasGpu, {
            className: styles.month,
            onMouseEnter: e => this.hover(month, e.currentTarget),
            onMouseLeave: this.unhover
        })
    }

    renderHoveredMonth() {
        const {hovered} = this.state
        return hovered ? (
            <FloatingBox
                className={styles.instanceTypes}
                element={hovered.element}
                vPlacement='below-or-above'
                hPlacement='over'
                onBlur={this.unhover}>
                {this.renderInstanceTypes(hovered.month.byInstanceType)}
            </FloatingBox>
        ) : null
    }

    renderInstanceTypes(byInstanceType) {
        const hasGpu = byInstanceType.some(({gpu}) => gpu)
        return (
            <table className={styles.table}>
                {this.renderHeader(msg('user.userDetails.form.usage.instanceType'), hasGpu)}
                <tbody>
                    {byInstanceType.map(row => this.renderRow(row.tag ?? row.name, row, hasGpu))}
                </tbody>
            </table>
        )
    }

    renderHeader(label, hasGpu) {
        return (
            <thead>
                <tr>
                    <th>{label}</th>
                    <th>{msg('user.userDetails.form.usage.hours')}</th>
                    <th>{msg('user.userDetails.form.usage.cost')}</th>
                    <th>{avgMaxHeader(msg('user.userSession.usage.cpu'))}</th>
                    <th>{avgMaxHeader(msg('user.userSession.usage.ram'))}</th>
                    {hasGpu ? <th>{avgMaxHeader(msg('user.userSession.usage.gpu'))}</th> : null}
                    <th>{msg('user.userDetails.form.usage.network')}</th>
                </tr>
            </thead>
        )
    }

    renderRow(label, {hours, cost, cpu, ram, gpu, netBytesPerS}, hasGpu, rowProps) {
        // avg/max in one cell: "12% / 96%"
        const avgMax = metric => metric ? `${Math.round(metric.avg)}% / ${Math.round(metric.max)}%` : '—'
        return (
            <tr key={label} {...rowProps}>
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

    hover(month, element) {
        this.setState({hovered: {month, element}})
    }

    unhover() {
        this.setState({hovered: null})
    }
}

const avgMaxHeader = metric =>
    msg('user.userDetails.form.usage.avgMax', {metric})

export const UsageStatistics = compose(
    _UsageStatistics,
    connect()
)

UsageStatistics.propTypes = {
    framed: PropTypes.any,
    username: PropTypes.string
}
