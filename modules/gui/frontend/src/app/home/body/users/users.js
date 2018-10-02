import {PageControls, PageData, PageInfo, Pageable} from 'widget/pageable'
import {connect} from 'store'
import {map, share, zip} from 'rxjs/operators'
import {msg} from 'translate'
import {of} from 'rxjs'
import Highlight from 'react-highlighter'
import Icon from 'widget/icon'
import React from 'react'
import _ from 'lodash'
import api from 'api'
import escapeStringRegexp from 'escape-string-regexp'
import format from 'format'
import styles from './users.module.css'

import budgetReport from './apiSample/get.budgetReport'
import userList from './apiSample/get.userList'

// const userList$ = api.user.getUserList$().pipe(
const userList$ = of(userList).pipe(
    share()
)

// const budgetReport$ = api.user.getBudgetReport$().pipe(
const budgetReport$ = of(budgetReport).pipe(
    zip(userList$),
    map(([budgetReport]) => budgetReport)
)

class Users extends React.Component {
    state = {
        users: [],
        sortingOrder: 'name',
        sortingDirection: 1,
        filter: ''
    }

    componentDidMount() {
        this.props.stream('LOAD_USER_LIST',
            userList$,
            userList => this.setUserList(userList)
        )
        this.props.stream('LOAD_BUDGET_REPORT',
            budgetReport$,
            budgetReport => this.mergeBudgetReport(budgetReport)
        )
    }

    setUserList(userList) {
        this.setState(prevState => ({
            ...prevState,
            users: _.map(userList, user => ({
                ...user,
                report: {}
            }))
        }))
    }

    mergeBudgetReport(budgetReport) {
        this.setState(prevState => ({
            ...prevState,
            users: _.map(prevState.users, user => ({
                ...user,
                report: budgetReport[user.username || {}]
            }))
        }))
    }

    setSorting(sortingOrder) {
        this.setState(prevState => {
            const sortingDirection = sortingOrder === prevState.sortingOrder ? -prevState.sortingDirection : 1
            return {
                ...prevState,
                sortingOrder,
                sortingDirection,
                users: _.orderBy(prevState.users, user => _.get(user, sortingOrder), sortingDirection === 1 ? 'asc' : 'desc')
            }
        })
    }

    setFilter(filter) {
        this.setState(prevState => ({
            ...prevState,
            filter,
            page: 1
        }))
    }
 
    getUsers() {
        const searchProperties = ['name', 'username', 'email', 'organization']
        if (this.state.filter) {
            const filter = RegExp(escapeStringRegexp(this.state.filter), 'i')
            return this.state.users.filter(user =>
                _.find(searchProperties, searchProperty =>
                    filter.test(user[searchProperty])
                )
            )
        }
        return this.state.users
    }

    renderSorting(sorting) {
        return this.state.sortingOrder === sorting
            ? this.state.sortingDirection === 1
                ? <Icon name={'sort-down'}/>
                : <Icon name={'sort-up'}/>
            : <Icon name={'sort'}/>
    }

    renderHeaders() {
        return (
            <React.Fragment>
                <tr>
                    <th className={styles.clickable} rowSpan={2} onClick={() => this.setSorting('name')}>
                        {msg('user.userDetails.form.name.label')}
                        {this.renderSorting('name')}
                    </th>
                    <th className={styles.clickable} rowSpan={2} onClick={() => this.setSorting('username')}>
                        {msg('user.userDetails.form.username.label')}
                        {this.renderSorting('username')}
                    </th>
                    <th className={styles.clickable} rowSpan={2} onClick={() => this.setSorting('status')}>
                        {msg('user.userDetails.form.status.label')}
                        {this.renderSorting('status')}
                    </th>
                    <th colSpan={2} style={{textAlign: 'center'}}>{msg('user.report.resources.monthlyInstance')}</th>
                    <th colSpan={2} style={{textAlign: 'center'}}>{msg('user.report.resources.monthlyStorage')}</th>
                    <th colSpan={2} style={{textAlign: 'center'}}>{msg('user.report.resources.storage')}</th>
                </tr>
                <tr>
                    <th className={[styles.number, styles.clickable].join(' ')}
                        onClick={() => this.setSorting('report.monthlyInstanceBudget')}>
                        {msg('user.report.resources.quota')}
                        {this.renderSorting('report.monthlyInstanceBudget')}
                    </th>
                    <th className={[styles.number, styles.clickable].join(' ')}
                        onClick={() => this.setSorting('report.monthlyInstanceSpending')}>
                        {msg('user.report.resources.used')}
                        {this.renderSorting('report.monthlyInstanceSpending')}
                    </th>
                    <th className={[styles.number, styles.clickable].join(' ')}
                        onClick={() => this.setSorting('report.monthlyStorageBudget')}>
                        {msg('user.report.resources.quota')}
                        {this.renderSorting('report.monthlyStorageBudget')}
                    </th>
                    <th className={[styles.number, styles.clickable].join(' ')}
                        onClick={() => this.setSorting('report.monthlyStorageSpending')}>
                        {msg('user.report.resources.used')}
                        {this.renderSorting('report.monthlyStorageSpending')}
                    </th>
                    <th className={[styles.number, styles.clickable].join(' ')}
                        onClick={() => this.setSorting('report.storageQuota')}>
                        {msg('user.report.resources.quota')}
                        {this.renderSorting('report.storageQuota')}
                    </th>
                    <th className={[styles.number, styles.clickable].join(' ')}
                        onClick={() => this.setSorting('report.storageUsed')}>
                        {msg('user.report.resources.used')}
                        {this.renderSorting('report.storageUsed')}
                    </th>
                </tr>
            </React.Fragment>
        )
    }

    renderUsers() {
        return (
            <PageData>
                {user => {
                    const {id, name, username, status, report: {monthlyInstanceBudget, monthlyInstanceSpending, monthlyStorageBudget, monthlyStorageSpending, storageQuota, storageUsed}} = user
                    return (
                        <tr key={id} className={styles.clickable}>
                            <td><Highlight search={this.state.filter} matchClass={styles.highlight}>{name}</Highlight></td>
                            <td><Highlight search={this.state.filter} matchClass={styles.highlight}>{username}</Highlight></td>
                            <td>{status}</td>
                            <td className={styles.number}>{format.dollars(monthlyInstanceBudget, 0)}</td>
                            <td className={styles.number}>{format.dollars(monthlyInstanceSpending)}</td>
                            <td className={styles.number}>{format.dollars(monthlyStorageBudget, 0)}</td>
                            <td className={styles.number}>{format.dollars(monthlyStorageSpending)}</td>
                            <td className={styles.number}>{format.GB(storageQuota, 0)}</td>
                            <td className={styles.number}>{format.GB(storageUsed)}</td>
                        </tr>
                    )
                }}
            </PageData>
        )
    }

    renderControls() {
        return (
            <div className={styles.pageControls}>
                <input
                    type="text"
                    value={this.state.filter}
                    placeholder={'filter results'}
                    onChange={e => this.setFilter(e.target.value)}/>
                <PageControls/>
            </div>
        )
    }

    renderInfo() {
        return (
            <PageInfo>
                {({pageNumber, pageCount, itemCount}) =>
                    <div className={styles.pageInfo}>
                        <div>{itemCount} matching results</div>
                        <div>Page {pageNumber} of {pageCount}</div>
                    </div>
                }
            </PageInfo>
        )
    }

    render() {
        return (
            <div className={styles.container}>
                <div>
                    <Pageable items={this.getUsers()} limit={20}>
                        {this.renderControls()}
                        {this.renderInfo()}
                        <table>
                            <thead>
                                {this.renderHeaders()}
                            </thead>
                            <tbody>
                                {this.renderUsers()}
                            </tbody>
                        </table>
                    </Pageable>
                </div>
            </div>
        )
    }
}

export default connect()(Users)
