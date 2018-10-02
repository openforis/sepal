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

    renderHeadings() {
        return (
            <div className={styles.grid}>
                <div className={[styles.name, styles.clickable].join(' ')}
                    onClick={() => this.setSorting('name')}>
                    {msg('user.userDetails.form.name.label')}
                    {this.renderSorting('name')}
                </div>

                <div className={[styles.username, styles.clickable].join(' ')}
                    onClick={() => this.setSorting('username')}>
                    {msg('user.userDetails.form.username.label')}
                    {this.renderSorting('username')}
                </div>

                <div className={[styles.status, styles.clickable].join(' ')}
                    onClick={() => this.setSorting('status')}>
                    {msg('user.userDetails.form.status.label')}
                    {this.renderSorting('status')}
                </div>

                <div className={styles.instanceBudget}>
                    {msg('user.report.resources.monthlyInstance')}
                </div>

                <div className={styles.storageBudget}>
                    {msg('user.report.resources.monthlyStorage')}
                </div>

                <div className={styles.storage}>
                    {msg('user.report.resources.storage')}
                </div>

                <div className={[styles.number, styles.clickable].join(' ')}
                    onClick={() => this.setSorting('report.monthlyInstanceBudget')}>
                    {msg('user.report.resources.quota')}
                    {this.renderSorting('report.monthlyInstanceBudget')}
                </div>

                <div className={[styles.number, styles.clickable].join(' ')}
                    onClick={() => this.setSorting('report.monthlyInstanceSpending')}>
                    {msg('user.report.resources.used')}
                    {this.renderSorting('report.monthlyInstanceSpending')}
                </div>

                <div className={[styles.number, styles.clickable].join(' ')}
                    onClick={() => this.setSorting('report.monthlyStorageBudget')}>
                    {msg('user.report.resources.quota')}
                    {this.renderSorting('report.monthlyStorageBudget')}
                </div>

                <div className={[styles.number, styles.clickable].join(' ')}
                    onClick={() => this.setSorting('report.monthlyStorageSpending')}>
                    {msg('user.report.resources.used')}
                    {this.renderSorting('report.monthlyStorageSpending')}
                </div>

                <div className={[styles.number, styles.clickable].join(' ')}
                    onClick={() => this.setSorting('report.storageQuota')}>
                    {msg('user.report.resources.quota')}
                    {this.renderSorting('report.storageQuota')}
                </div>

                <div className={[styles.number, styles.clickable].join(' ')}
                    onClick={() => this.setSorting('report.storageUsed')}>
                    {msg('user.report.resources.used')}
                    {this.renderSorting('report.storageUsed')}
                </div>
            </div>
        )
    }

    renderUsers() {
        return (
            <PageData>
                {user => {
                    const {id, name, username, status, report: {monthlyInstanceBudget, monthlyInstanceSpending, monthlyStorageBudget, monthlyStorageSpending, storageQuota, storageUsed}} = user
                    return (
                        <div key={id} className={[styles.grid, styles.clickable].join(' ')}>
                            <div><Highlight search={this.state.filter} matchClass={styles.highlight}>{name}</Highlight></div>
                            <div><Highlight search={this.state.filter} matchClass={styles.highlight}>{username}</Highlight></div>
                            <div>{status}</div>
                            <div className={styles.number}>{format.dollars(monthlyInstanceBudget, 0)}</div>
                            <div className={styles.number}>{format.dollars(monthlyInstanceSpending)}</div>
                            <div className={styles.number}>{format.dollars(monthlyStorageBudget, 0)}</div>
                            <div className={styles.number}>{format.dollars(monthlyStorageSpending)}</div>
                            <div className={styles.number}>{format.GB(storageQuota, 0)}</div>
                            <div className={styles.number}>{format.GB(storageUsed)}</div>
                        </div>
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
                        <div>{msg('users.count', {count: itemCount})}</div>
                        <div>{msg('users.page', {pageNumber, pageCount})}</div>
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

                        <div className={styles.heading}>
                            {this.renderHeadings()}
                        </div>

                        <div className={styles.users}>
                            {this.renderUsers()}
                        </div>

                    </Pageable>
                </div>
            </div>
        )
    }
}

export default connect()(Users)
