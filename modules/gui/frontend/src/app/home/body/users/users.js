import {Button} from '../../../../widget/button'
import {PageControls, PageData, PageInfo, Pageable} from 'widget/pageable'
import {connect} from 'store'
import {map, share, zip} from 'rxjs/operators'
import {msg} from 'translate'
import Highlight from 'react-highlighter'
import Icon from 'widget/icon'
import Notifications from 'app/notifications'
import React from 'react'
import UserDetails from './userDetails'
import _ from 'lodash'
import api from 'api'
import escapeStringRegexp from 'escape-string-regexp'
import format from 'format'
import styles from './users.module.css'

// import budgetReport from './apiSample/get.budgetReport'
// import userList from './apiSample/get.userList'

const getUserList$ = api.user.getUserList$().pipe(
// const getUserList$ = of(userList).pipe(
    share()
)

const getBudgetReport$ = api.user.getBudgetReport$().pipe(
// const getBudgetReport$ = of(budgetReport).pipe(
    zip(getUserList$),
    map(([budgetReport]) => budgetReport)
)

class Users extends React.Component {
    state = {
        users: [],
        sortingOrder: 'name',
        sortingDirection: 1,
        filter: '',
        userDetails: null
    }
    search = React.createRef()

    componentDidMount() {
        const setUserList = (userList) =>
            this.setState(prevState => ({
                ...prevState,
                users: this.getSortedUsers(
                    _.map(userList, user => ({
                        ...user,
                        report: {}
                    }))
                )
            }))
        const mergeBudgetReport = (budgetReport) =>
            this.setState(prevState => ({
                ...prevState,
                users: _.map(prevState.users, user => ({
                    ...user,
                    report: budgetReport[user.username || {}]
                }))
            }))

        this.props.stream('LOAD_USER_LIST',
            getUserList$,
            userList => setUserList(userList)
        )
        this.props.stream('LOAD_BUDGET_REPORT',
            getBudgetReport$,
            budgetReport => mergeBudgetReport(budgetReport)
        )
    }

    setSorting(sortingOrder) {
        this.setState(prevState => {
            const sortingDirection = sortingOrder === prevState.sortingOrder ? -prevState.sortingDirection : 1
            return {
                ...prevState,
                sortingOrder,
                sortingDirection,
                users: this.getSortedUsers(prevState.users, sortingOrder, sortingDirection)
            }
        })
    }

    getSortedUsers(users, sortingOrder = this.state.sortingOrder, sortingDirection = this.state.sortingDirection) {
        return _.orderBy(users, user => _.get(user, sortingOrder), sortingDirection === 1 ? 'asc' : 'desc')
    }

    setFilter(filter) {
        this.setState(prevState => ({
            ...prevState,
            filter
        }))
    }
 
    getFilteredUsers() {
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

    onKeyDown({key}) {
        const keyMap = {
            Escape: () => {
                this.setFilter('')
            }
        }
        const keyAction = keyMap[key]
        keyAction && keyAction()
        this.search.current.focus()
    }

    renderSortingHandle(sorting) {
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
                    {this.renderSortingHandle('name')}
                </div>

                {/* <div className={[styles.username, styles.clickable].join(' ')}
                    onClick={() => this.setSorting('username')}>
                    {msg('user.userDetails.form.username.label')}
                    {this.renderSortingHandle('username')}
                </div> */}

                <div className={[styles.status, styles.clickable].join(' ')}
                    onClick={() => this.setSorting('status')}>
                    {msg('user.userDetails.form.status.label')}
                    {this.renderSortingHandle('status')}
                </div>

                <div className={[styles.instanceBudget, styles.group].join(' ')}>
                    {msg('user.report.resources.monthlyInstance')}
                </div>

                <div className={[styles.storageBudget, styles.group].join(' ')}>
                    {msg('user.report.resources.monthlyStorage')}
                </div>

                <div className={[styles.storage, styles.group].join(' ')}>
                    {msg('user.report.resources.storage')}
                </div>

                <div className={[styles.number, styles.clickable].join(' ')}
                    onClick={() => this.setSorting('report.monthlyInstanceBudget')}>
                    {msg('user.report.resources.quota')}
                    {this.renderSortingHandle('report.monthlyInstanceBudget')}
                </div>

                <div className={[styles.number, styles.clickable].join(' ')}
                    onClick={() => this.setSorting('report.monthlyInstanceSpending')}>
                    {msg('user.report.resources.used')}
                    {this.renderSortingHandle('report.monthlyInstanceSpending')}
                </div>

                <div className={[styles.number, styles.clickable].join(' ')}
                    onClick={() => this.setSorting('report.monthlyStorageBudget')}>
                    {msg('user.report.resources.quota')}
                    {this.renderSortingHandle('report.monthlyStorageBudget')}
                </div>

                <div className={[styles.number, styles.clickable].join(' ')}
                    onClick={() => this.setSorting('report.monthlyStorageSpending')}>
                    {msg('user.report.resources.used')}
                    {this.renderSortingHandle('report.monthlyStorageSpending')}
                </div>

                <div className={[styles.number, styles.clickable].join(' ')}
                    onClick={() => this.setSorting('report.storageQuota')}>
                    {msg('user.report.resources.quota')}
                    {this.renderSortingHandle('report.storageQuota')}
                </div>

                <div className={[styles.number, styles.clickable].join(' ')}
                    onClick={() => this.setSorting('report.storageUsed')}>
                    {msg('user.report.resources.used')}
                    {this.renderSortingHandle('report.storageUsed')}
                </div>
            </div>
        )
    }

    renderSearch() {
        return (
            <input
                type="text"
                ref={this.search}
                value={this.state.filter}
                placeholder={'filter results'}
                onChange={e => this.setFilter(e.target.value)}/>
        )
    }

    renderAddUser() {
        return (
            <Button
                icon='plus'
                label={msg('users.add.label')}
                onClick={() => this.addUser()}/>
        )
    }

    renderControls() {
        return (
            <div className={styles.pageControls}>
                {this.renderSearch()}
                {this.renderAddUser()}
                <PageControls/>
            </div>
        )
    }

    renderInfo() {
        const {filter} = this.state
        const results = (count) => filter
            ? msg('users.countWithFilter', {count, filter})
            : msg('users.countNoFilter', {count})
        return (
            <PageInfo>
                {({pageNumber, pageCount, itemCount}) =>
                    <div className={styles.pageInfo}>
                        <div>{results(itemCount)}</div>
                        <div>{msg('users.page', {pageNumber, pageCount})}</div>
                    </div>
                }
            </PageInfo>
        )
    }

    renderUsers() {
        return (
            <PageData>
                {(user, index) => <User
                    key={user.username || user.id || index}
                    user={user}
                    highlight={this.state.filter}
                    onClick={() => this.editUser(user)}/>
                }
            </PageData>
        )
    }

    editUser(user) {
        this.setState(prevState => ({
            ...prevState,
            userDetails: {
                username: user.username,
                name: user.name,
                email: user.email,
                organization: user.organization,
                monthlyInstanceBudget: user.report.monthlyInstanceBudget,
                monthlyStorageBudget: user.report.monthlyStorageBudget,
                storageQuota: user.report.storageQuota
            }
        }))
    }

    addUser() {
        this.setState(prevState => ({
            ...prevState,
            userDetails: {}
        }))
    }

    cancelUser() {
        this.setState(prevState => ({
            ...prevState,
            userDetails: null
        }))
    }

    updateUser(userDetails) {
        const updateUserDetails$ = (username, {name, email, organization}) =>
            api.user.updateUserDetails$({username, name, email, organization})

        const updateUserBudget$ = (username, {monthlyInstanceBudget, monthlyStorageBudget, storageQuota}) =>
            api.user.updateUserBudget$({username, monthlyInstanceBudget, monthlyStorageBudget, storageQuota})

        const update$ = (username, userDetails) =>
            updateUserDetails$(username, userDetails).pipe(
                zip(updateUserBudget$(username, userDetails)),
                map(([userDetails]) => userDetails)
            )

        const user = {
            username: userDetails.username,
            name: userDetails.name,
            email: userDetails.email,
            organization: userDetails.organization,
            report: {
                monthlyInstanceBudget: userDetails.monthlyInstanceBudget,
                monthlyStorageBudget: userDetails.monthlyStorageBudget,
                storageQuota: userDetails.storageQuota
            }
        }

        this.props.stream('UPDATE_USER',
            update$(this.state.userDetails.username, userDetails),
            () => Notifications.success('user.userDetails.update').dispatch(),
            error => Notifications.caught('user.userDetails.update', {}, error).dispatch()
        )

        this.setState(prevState => {
            const users = prevState.users
            if (userDetails) {
                const index = users.findIndex(user => user.username === prevState.userDetails.username)
                if (index === -1) {
                    users.push(user)
                } else {
                    _.merge(users[index], user)
                }
            }
            return {
                ...prevState,
                users,
                userDetails: null
            }
        })
    }

    renderUserDetails() {
        return this.state.userDetails ? (
            <UserDetails
                userDetails={this.state.userDetails}
                onCancel={() => this.cancelUser()}
                onSave={userDetails => this.updateUser(userDetails)}/>
        ) : null
    }

    render() {
        return (
            <React.Fragment>
                <div
                    className={styles.container}
                    tabIndex='0'
                    onKeyDown={e => this.onKeyDown(e)}>
                    <div>
                        <Pageable
                            items={this.getFilteredUsers()}
                            watch={[this.state.sortingOrder, this.state.sortingDirection, this.state.filter]}
                            limit={20}>
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
                {this.renderUserDetails()}
            </React.Fragment>
        )
    }
}

export default connect()(Users)

class User extends React.Component {
    render() {
        const {
            user:{
                name,
                // username,
                status,
                report: {
                    monthlyInstanceBudget,
                    monthlyInstanceSpending,
                    monthlyStorageBudget,
                    monthlyStorageSpending,
                    storageQuota,
                    storageUsed
                }
            },
            highlight,
            onClick
        } = this.props
        return (
            <div
                className={[styles.grid, styles.clickable].join(' ')}
                onClick={() => onClick()}>
                <div><Highlight search={highlight} matchClass={styles.highlight}>{name}</Highlight></div>
                {/* <div><Highlight search={highlight} matchClass={styles.highlight}>{username}</Highlight></div> */}
                <div>{status}</div>
                <div className={styles.number}>{format.dollars(monthlyInstanceBudget, 0)}</div>
                <div className={styles.number}>{format.dollars(monthlyInstanceSpending)}</div>
                <div className={styles.number}>{format.dollars(monthlyStorageBudget, 0)}</div>
                <div className={styles.number}>{format.dollars(monthlyStorageSpending)}</div>
                <div className={styles.number}>{format.GB(storageQuota, 0)}</div>
                <div className={styles.number}>{format.GB(storageUsed)}</div>
            </div>
        )
    }
}
