import {Controls, Data} from './paginate'
import {connect} from 'store'
import {map, share, zip} from 'rxjs/operators'
import {msg} from 'translate'
import {of} from 'rxjs'
import Highlight from 'react-highlighter'
import Highlighter from 'react-highlight-words'
import Icon from 'widget/icon'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import api from 'api'
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
        filter: '',
        page: 1
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
 
    prevPage() {
        this.setState(prevState => ({
            ...prevState,
            page: Math.max(prevState.page - 1, 1)
        }))
    }

    nextPage() {
        this.setState(prevState => ({
            ...prevState,
            page: prevState.page + 1
        }))
    }

    getUsers() {
        const searchProperties = ['name', 'username']
        if (this.state.filter) {
            const filter = RegExp(this.state.filter, 'i')
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

    renderUsers() {
        return (
            <div className={styles.container}>
                <div>
                    <input
                        type="text"
                        value={this.state.filter}
                        placeholder={'filter results'}
                        onChange={e => this.setFilter(e.target.value)}/>
                </div>
                <div>
                    <table>
                        <thead>
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
                        </thead>
                        <tbody>
                            <Paginate items={this.getUsers()} limit={20} page={this.state.page}>
                                {/* <Data items={this.getUsers()} limit={10}> */}
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
                                {/* </Data> */}
                            </Paginate>
                        </tbody>
                    </table>
                    <div>
                        {/* <Controls/> */}
                        {/* <span>Page no. {page.pageNumber} of {page.totalPages}</span> */}
                        <button onClick={() => this.prevPage()}>Previous page</button>
                        <button onClick={() => this.nextPage()}>Next page</button>
                    </div>
                </div>
            </div>
        )
    }

    render() {
        return (
            <div>
                {this.renderUsers()}
            </div>
        )
    }
}

export default connect()(Users)

class Paginate extends React.Component {
    render() {
        const {items, limit, page} = this.props
        const pageItems = items.slice((page - 1) * limit, page * limit)
        return (
            <React.Fragment>
                {pageItems.map(item => this.props.children(item))}
            </React.Fragment>
        )
    }
}

Paginate.propTypes = {
    children: PropTypes.func.isRequired,
    items: PropTypes.array.isRequired,
    limit: PropTypes.number.isRequired,
    page: PropTypes.number.isRequired
}
