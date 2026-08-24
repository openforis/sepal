import PropTypes from 'prop-types'
import React from 'react'

import api from '~/apiRegistry'
import {compose} from '~/compose'
import {connect} from '~/connect'
import format from '~/format'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Icon} from '~/widget/icon'

import styles from './userUsage.module.css'

const DAYS = 30

class _UserUsage extends React.Component {
    state = {usage: null, failed: false}

    componentDidMount() {
        const {username, stream} = this.props
        stream('LOAD_USER_USAGE',
            api.sessions.userUsage$(username, DAYS),
            usage => this.setState({usage}),
            () => this.setState({failed: true})
        )
    }

    render() {
        return (
            <Form.FieldSet
                className={styles.usage}
                layout='vertical'
                label={msg('user.userDetails.form.usage.label', {days: DAYS})}>
                {this.renderContent()}
            </Form.FieldSet>
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
                        <th/>
                        <th>{msg('user.userDetails.form.usage.hours')}</th>
                        <th>{msg('user.userSession.usage.cpu')}</th>
                        <th>{msg('user.userSession.usage.ram')}</th>
                        {hasGpu ? <th>{msg('user.userSession.usage.gpu')}</th> : null}
                        <th>{msg('user.userDetails.form.usage.network')}</th>
                    </tr>
                </thead>
                <tbody>
                    {byInstanceType.map(row => this.renderRow(row.name, row, hasGpu))}
                    {byInstanceType.length > 1
                        ? this.renderRow(msg('user.userDetails.form.usage.overall'), overall, hasGpu)
                        : null}
                </tbody>
            </table>
        )
    }

    renderRow(label, {hours, cpu, ram, gpu, netBytesPerS}, hasGpu) {
        // avg/max in one cell: "12% / 96%"
        const avgMax = metric => metric ? `${Math.round(metric.avg)}% / ${Math.round(metric.max)}%` : '—'
        return (
            <tr key={label}>
                <td>{label}</td>
                <td>{hours}</td>
                <td>{avgMax(cpu)}</td>
                <td>{avgMax(ram)}</td>
                {hasGpu ? <td>{avgMax(gpu)}</td> : null}
                <td>{netBytesPerS !== null ? `${format.fileSize(netBytesPerS)}/s` : '—'}</td>
            </tr>
        )
    }
}

export const UserUsage = compose(
    _UserUsage,
    connect()
)

UserUsage.propTypes = {
    username: PropTypes.string.isRequired
}
