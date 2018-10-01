import {msg} from 'translate'
import React from 'react'
import _ from 'lodash'
import format from 'format'
import styles from './users.module.css'

import userList from './apiSample/get.userList'
import userReport from './apiSample/get.budgetReport'

const users = _.map(userList, user => _.assign({}, user, {report: userReport[user.username || {}]}))

export default class Users extends React.Component {
    renderUser(user) {
        const {
            id,
            name,
            username,
            status,
            report: {
                monthlyInstanceBudget,
                monthlyInstanceSpending,
                monthlyStorageBudget,
                monthlyStorageSpending,
                storageQuota,
                storageUsed
            }
        } = user
        return (
            <tr key={id} className={styles.clickable}>
                <td>{name}</td>
                <td>{username}</td>
                <td>{status}</td>
                <td className={styles.number}>{format.dollars(monthlyInstanceBudget)}</td>
                <td className={styles.number}>{format.dollars(monthlyInstanceSpending)}</td>
                <td className={styles.number}>{format.dollars(monthlyStorageBudget)}</td>
                <td className={styles.number}>{format.dollars(monthlyStorageSpending)}</td>
                <td className={styles.number}>{format.decimal(storageQuota)}</td>
                <td className={styles.number}>{format.decimal(storageUsed)}</td>
            </tr>
        )
    }

    renderUsers() {
        return (
            <table>
                <thead>
                    <tr>
                        <th rowSpan={2}>{msg('user.userDetails.form.name.label')}</th>
                        <th rowSpan={2}>{msg('user.userDetails.form.username.label')}</th>
                        <th rowSpan={2}>{msg('user.userDetails.form.status.label')}</th>
                        <th colSpan={2}>{msg('user.report.resources.monthlyInstance')}</th>
                        <th colSpan={2}>{msg('user.report.resources.monthlyStorage')}</th>
                        <th colSpan={2}>{msg('user.report.resources.storage')}</th>
                    </tr>
                    <tr>
                        <th className={styles.number}>{msg('user.report.resources.quota')}</th>
                        <th className={styles.number}>{msg('user.report.resources.used')}</th>
                        <th className={styles.number}>{msg('user.report.resources.quota')}</th>
                        <th className={styles.number}>{msg('user.report.resources.used')}</th>
                        <th className={styles.number}>{msg('user.report.resources.quota')}</th>
                        <th className={styles.number}>{msg('user.report.resources.used')}</th>
                    </tr>
                </thead>
                <tbody>
                    {users.map(this.renderUser)}
                </tbody>
            </table>
        )
    }

    render() {
        return (
            <div>
                {/* {this.renderUsers()} */}
            </div>
        )
    }
}
