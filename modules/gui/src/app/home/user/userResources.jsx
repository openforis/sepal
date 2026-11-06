import React from 'react'

import {compose} from '~/compose'
import {connect} from '~/connect'
import format from '~/format'
import {select} from '~/store'
import {msg} from '~/translate'

import {UsageMeter} from './usageMeter'
import styles from './userResources.module.css'

const COST_PREFIX = '$ '
const WARNING_PERCENTAGE = 70
const ERROR_PERCENTAGE = 90

const mapStateToProps = () => ({
    userReport: select('user.currentUserReport') || {}
})

class _UserResources extends React.Component {
    render() {
        const {userReport: {spending}} = this.props
        return spending
            ? (
                <div className={styles.resources}>
                    {this.renderHeader()}
                    {this.renderInstanceBudget(spending)}
                    {this.renderStorageBudget(spending)}
                    {this.renderStorage(spending)}
                </div>
            )
            : null
    }

    renderHeader() {
        return (
            <React.Fragment>
                <div/>
                <div className={[styles.heading, styles.used].join(' ')}>{msg('user.report.resources.used')}</div>
                <div/>
                <div className={[styles.heading, styles.max].join(' ')}>{msg('user.report.resources.max')}</div>
                <div className={styles.line}/>
            </React.Fragment>
        )
    }

    renderInstanceBudget({monthlyInstanceSpending, monthlyInstanceBudget}) {
        return this.renderResource(
            msg('user.report.resources.instanceSpending'),
            monthlyInstanceSpending,
            monthlyInstanceBudget,
            this.formatBudget(monthlyInstanceBudget)
        )
    }

    renderStorageBudget({monthlyStorageSpending, monthlyStorageBudget}) {
        return this.renderResource(
            msg('user.report.resources.storageSpending'),
            monthlyStorageSpending,
            monthlyStorageBudget,
            this.formatBudget(monthlyStorageBudget)
        )
    }

    renderStorage({storageUsed, storageQuota}) {
        return this.renderResource(
            msg('user.report.resources.storageSpace'),
            storageUsed,
            storageQuota,
            format.number({value: storageQuota, scale: 'G', unit: 'B'})
        )
    }

    renderResource(label, used, max, formattedMax) {
        const percentage = max > 0 ? Math.round(100 * used / max) : 0
        return (
            <React.Fragment>
                <div>{label}</div>
                <div className={styles.used}>{percentage}%</div>
                <UsageMeter
                    value={Math.min(percentage, 100)}
                    color={this.usedColor(percentage)}
                    label={msg('user.report.usage', {percentage})}
                />
                <div className={styles.max}>{formattedMax}</div>
            </React.Fragment>
        )
    }

    usedColor(percentage) {
        if (percentage > ERROR_PERCENTAGE) {
            return 'var(--error-color)'
        }
        return percentage > WARNING_PERCENTAGE
            ? 'var(--warning-color)'
            : 'var(--success-color)'
    }

    formatBudget(budget) {
        return format.dollars(budget, {prefix: COST_PREFIX, suffix: '/mo.'})
    }
}

export const UserResources = compose(
    _UserResources,
    connect(mapStateToProps)
)
