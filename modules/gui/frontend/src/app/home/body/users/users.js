import {BottomBar, Content, SectionLayout, TopBar} from 'widget/sectionLayout'
import {Button} from 'widget/button'
import {Buttons} from 'widget/buttons'
import {Layout} from 'widget/layout'
import {Pageable} from 'widget/pageable/pageable'
import {Scrollable, ScrollableContainer, Unscrollable} from 'widget/scrollable'
import {SearchBox} from 'widget/searchBox'
import {compose} from 'compose'
import {connect} from 'store'
import {forkJoin} from 'rxjs'
import {map, zip} from 'rxjs/operators'
import {msg} from 'translate'
import Highlight from 'react-highlighter'
import Icon from 'widget/icon'
import Label from 'widget/label'
import Notifications from 'widget/notifications'
import React from 'react'
import UserDetails from './user'
import _ from 'lodash'
import api from 'api'
import format from 'format'
import lookStyles from 'style/look.module.css'
import moment from 'moment'
import styles from './users.module.css'

const getUserList$ = () => forkJoin(
    api.user.getUserList$(),
    api.user.getBudgetReport$()
).pipe(
    map(([users, budget]) =>
        _.map(users, user => ({
            ...user,
            report: budget[user.username || {}]
        }))
    )
)

class Users extends React.Component {
    state = {
        users: [],
        sortingOrder: 'updateTime',
        sortingDirection: -1,
        textFilterValues: [],
        statusFilter: null,
        userDetails: null
    }

    search = React.createRef()

    componentDidMount() {
        const setUserList = userList =>
            this.setState({
                users: this.getSortedUsers(userList)
            })

        this.props.stream('LOAD_USER_LIST',
            getUserList$(),
            userList => setUserList(userList)
        )
    }

    setSorting(sortingOrder, defaultSorting) {
        this.setState(prevState => {
            const sortingDirection = sortingOrder === prevState.sortingOrder
                ? -prevState.sortingDirection
                : defaultSorting
            return {
                ...prevState,
                sortingOrder,
                sortingDirection,
                users: this.getSortedUsers(prevState.users, sortingOrder, sortingDirection)
            }
        })
    }

    getSortedUsers(users, sortingOrder = this.state.sortingOrder, sortingDirection = this.state.sortingDirection) {
        return _.orderBy(users, user => {
            const item = _.get(user, sortingOrder)
            return _.isString(item) ? item.toUpperCase() : item
        }, sortingDirection === 1 ? 'asc' : 'desc')
    }

    setTextFilter(textFilterValues) {
        this.setState({
            textFilterValues
        })
    }

    setActiveFilter(activeFilter) {
        this.setState({activeFilter})
    }

    userMatchesFilters(user) {
        return this.userMatchesTextFilter(user) && this.userMatchesStatusFilter(user)
    }

    userMatchesTextFilter(user) {
        const {textFilterValues} = this.state
        const searchMatchers = textFilterValues.map(filter => RegExp(filter, 'i'))
        const searchProperties = ['name', 'username', 'email', 'organization']
        return textFilterValues
            ? _.every(searchMatchers, matcher =>
                _.find(searchProperties, property =>
                    matcher.test(user[property])
                )
            )
            : true
    }

    userMatchesStatusFilter(user) {
        const {statusFilter} = this.state
        return statusFilter
            ? statusFilter === 'OVERBUDGET'
                ? this.isUserOverBudget(user)
                : user.status === statusFilter
            : true
    }

    isUserOverBudget({report: {budget, current}}) {
        return current.instanceSpending > budget.instanceSpending
            || current.storageSpending > budget.storageSpending
            || current.storageQuota > budget.storageQuota
    }

    onKeyDown({key}) {
        const keyMap = {
            Escape: () => {
                this.setTextFilter([])
            }
        }
        const keyAction = keyMap[key]
        keyAction && keyAction()
        this.search.current.focus()
    }

    editUser(user) {
        this.setState({
            userDetails: {
                username: user.username,
                name: user.name,
                email: user.email,
                organization: user.organization,
                monthlyBudgetInstanceSpending: user.report.budget.instanceSpending,
                monthlyBudgetStorageSpending: user.report.budget.storageSpending,
                monthlyBudgetStorageQuota: user.report.budget.storageQuota
            }
        })
    }

    inviteUser() {
        this.setState({
            userDetails: {
                newUser: true,
                monthlyBudgetInstanceSpending: 1,
                monthlyBudgetStorageSpending: 1,
                monthlyBudgetStorageQuota: 20
            }
        })
    }

    cancelUser() {
        this.setState({
            userDetails: null
        })
    }

    updateUser(userDetails) {
        const update$ = userDetails =>
            updateUserDetails$(userDetails).pipe(
                zip(updateUserBudget$(userDetails)),
                map(([userDetails, userBudget]) => ({
                    ...userDetails,
                    report: {
                        budget: userBudget
                    }
                }))
            )

        const updateUserDetails$ = ({newUser, username, name, email, organization}) =>
            newUser
                ? api.user.inviteUser$({username, name, email, organization})
                : api.user.updateUser$({username, name, email, organization})

        const updateUserBudget$ = ({
            username,
            monthlyBudgetInstanceSpending: instanceSpending,
            monthlyBudgetStorageSpending: storageSpending,
            monthlyBudgetStorageQuota: storageQuota
        }) => api.user.updateUserBudget$({
            username,
            instanceSpending,
            storageSpending,
            storageQuota
        })

        const updateLocalState = userDetails =>
            this.setState(({users}) => {
                if (userDetails) {
                    const index = users.findIndex(user => user.username === userDetails.username)
                    index === -1
                        ? users.push(userDetails)
                        : users[index] = userDetails
                }
                return {
                    users: this.getSortedUsers(users)
                }
            })

        const removeFromLocalState = userDetails =>
            this.setState(({users}) => {
                if (userDetails) {
                    _.remove(users, user => user.username === userDetails.username)
                }
                return {users}
            })

        this.cancelUser()

        updateLocalState({
            username: userDetails.username,
            name: userDetails.name,
            email: userDetails.email,
            organization: userDetails.organization,
            report: {
                budget: {
                    instanceSpending: userDetails.monthlyBudgetInstanceSpending,
                    storageSpending: userDetails.monthlyBudgetStorageSpending,
                    storageQuota: userDetails.monthlyBudgetStorageQuota
                }
            }
        })

        this.props.stream('UPDATE_USER',
            update$(userDetails),
            userDetails => {
                updateLocalState(userDetails)
                Notifications.success({message: msg('user.userDetails.update.success')})
            },
            error => {
                removeFromLocalState(userDetails)
                Notifications.error({message: msg('user.userDetails.update.error'), error})
            }
        )
    }

    renderSortingHandle(column, defaultSorting) {
        const {sortingOrder, sortingDirection} = this.state
        return sortingOrder === column
            ? sortingDirection === defaultSorting
                ? <Icon name={'sort-down'}/>
                : <Icon name={'sort-up'}/>
            : <Icon name={'sort'}/>
    }

    renderColumnHeader({column, label, defaultSorting, classNames = []}) {
        const {sortingOrder} = this.state
        return (
            <div className={classNames.join(' ')}>
                <Button
                    chromeless
                    shape='none'
                    additionalClassName='itemType'
                    onClick={() => this.setSorting(column, defaultSorting)}>
                    <span className={sortingOrder === column ? styles.sorted : null}>
                        {label}
                    </span>
                    <span className={styles.sortingHandle}>
                        {this.renderSortingHandle(column, defaultSorting)}
                    </span>
                </Button>
            </div>
        )
    }

    renderHeader() {
        return (
            <div className={[styles.grid, styles.header].join(' ')}>
                <Label className={styles.instanceBudget} msg={msg('user.report.resources.monthlyInstance')}/>
                <Label className={styles.storageBudget} msg={msg('user.report.resources.monthlyStorage')}/>
                <Label className={styles.storage} msg={msg('user.report.resources.storage')}/>
                <div className={styles.info}>
                    {this.renderInfo()}
                </div>
                {this.renderColumnHeader({
                    column: 'name',
                    label: msg('user.userDetails.form.name.label'),
                    defaultSorting: 1,
                    classNames: [styles.name]
                })}
                {this.renderColumnHeader({
                    column: 'status',
                    label: msg('user.userDetails.form.status.label'),
                    defaultSorting: 1,
                    classNames: [styles.status]
                })}
                {this.renderColumnHeader({
                    column: 'updateTime',
                    label: msg('user.userDetails.form.updateTime.label'),
                    defaultSorting: -1,
                    classNames: [styles.updateTime]
                })}
                {this.renderColumnHeader({
                    column: 'report.budget.instanceSpending',
                    label: msg('user.report.resources.quota'),
                    defaultSorting: -1,
                    classNames: [styles.instanceBudgetQuota, styles.number]
                })}
                {this.renderColumnHeader({
                    column: 'report.current.instanceSpending',
                    label: msg('user.report.resources.used'),
                    defaultSorting: -1,
                    classNames: [styles.instanceBudgetUsed, styles.number]
                })}
                {this.renderColumnHeader({
                    column: 'report.budget.storageSpending',
                    label: msg('user.report.resources.quota'),
                    defaultSorting: -1,
                    classNames: [styles.storageBudgetQuota, styles.number]
                })}
                {this.renderColumnHeader({
                    column: 'report.current.storageSpending',
                    label: msg('user.report.resources.used'),
                    defaultSorting: -1,
                    classNames: [styles.storageBudgetUsed, styles.number]
                })}
                {this.renderColumnHeader({
                    column: 'report.budget.storageQuota',
                    label: msg('user.report.resources.quota'),
                    defaultSorting: -1,
                    classNames: [styles.storageQuota, styles.number]
                })}
                {this.renderColumnHeader({
                    column: 'report.current.storageQuota',
                    label: msg('user.report.resources.used'),
                    defaultSorting: -1,
                    classNames: [styles.storageUsed, styles.number]
                })}
            </div>
        )
    }

    renderTextFilter() {
        return (
            <SearchBox
                placeholder={msg('users.filter.search.placeholder')}
                onSearchValues={searchValues => this.setTextFilter(searchValues)}/>
        )
    }

    renderStatusFilter() {
        const {statusFilter} = this.state
        const options = [{
            label: msg('users.filter.status.ignore.label'),
            value: null
        }, {
            label: msg('users.filter.status.pending.label'),
            value: 'PENDING'
        }, {
            label: msg('users.filter.status.active.label'),
            value: 'ACTIVE'
        }, {
            label: msg('users.filter.budget.over.label'),
            value: 'OVERBUDGET'
        }]
        return (
            <Buttons
                chromeless
                type='horizontal-tight'
                options={options}
                selected={statusFilter}
                onChange={statusFilter => this.setState({statusFilter})}
            />
        )
    }

    renderInviteUser() {
        return (
            <Button
                additionalClassName={styles.inviteUser}
                look='add'
                size='xx-large'
                shape='circle'
                icon='plus'
                tooltip={msg('users.invite.label')}
                tooltipPlacement='left'
                onClick={() => this.inviteUser()}/>
        )
    }

    renderInfo() {
        const results = (count, start, stop) => msg('users.count', {count, start, stop})
        return (
            <Pageable.Info>
                {({count, start, stop}) =>
                    <div className={styles.pageInfo}>
                        {results(count, start, stop)}
                    </div>
                }
            </Pageable.Info>
        )
    }

    renderUsers() {
        const {textFilterValues} = this.state
        const highlightMatcher = textFilterValues.length
            ? new RegExp(`(?:${textFilterValues.join('|')})`, 'i')
            : ''
        return (
            // [HACK] adding filter to key to force re-rendering
            <Pageable.Data itemKey={user => `${user.username || user.id}|${highlightMatcher}`}>
                {user =>
                    <User
                        user={user}
                        highlight={highlightMatcher}
                        onClick={() => this.editUser(user)}/>
                }
            </Pageable.Data>
        )
    }

    renderUserDetails() {
        const {userDetails} = this.state
        return userDetails ? (
            <UserDetails
                userDetails={userDetails}
                onCancel={() => this.cancelUser()}
                onSave={userDetails => this.updateUser(userDetails)}/>
        ) : null
    }

    render() {
        const {users} = this.state
        return (
            <div className={styles.container}>
                <Pageable
                    items={users}
                    matcher={user => this.userMatchesFilters(user)}>
                    <SectionLayout>
                        <TopBar label={msg('home.sections.users')}/>
                        <Content horizontalPadding verticalPadding menuPadding>
                            <ScrollableContainer>
                                <Unscrollable>
                                    <Layout type='horizontal' spacing='compact'>
                                        {this.renderTextFilter()}
                                        {this.renderStatusFilter()}
                                    </Layout>
                                </Unscrollable>
                                <Scrollable direction='x'>
                                    <ScrollableContainer className={styles.content}>
                                        <Unscrollable>
                                            {this.renderHeader()}
                                        </Unscrollable>
                                        <Scrollable direction='y' className={styles.users}>
                                            {this.renderUsers()}
                                        </Scrollable>
                                    </ScrollableContainer>
                                </Scrollable>
                            </ScrollableContainer>
                            {this.renderInviteUser()}
                        </Content>
                        <BottomBar className={styles.bottomBar}>
                            <Pageable.Controls/>
                        </BottomBar>
                    </SectionLayout>
                </Pageable>
                {this.renderUserDetails()}
            </div>
        )
    }
}

export default compose(
    Users,
    connect()
)

class User extends React.Component {
    render() {
        const {
            user: {
                name,
                status,
                updateTime,
                report: {
                    budget = {},
                    current = {}
                } = {}
            },
            highlight,
            onClick
        } = this.props
        return (
            <div
                className={[
                    lookStyles.look,
                    lookStyles.transparent,
                    lookStyles.chromeless,
                    styles.grid,
                    styles.user,
                    status ? styles.clickable : null
                ].join(' ')}
                onClick={() => status ? onClick() : null}>
                <div><Highlight search={highlight} ignoreDiacritics={true} matchClass={styles.highlight}>{name}</Highlight></div>
                <div>{status ? msg(`user.userDetails.form.status.${status}`) : <Icon name='spinner'/>}</div>
                <div>{moment(updateTime).fromNow()}</div>
                <div className={styles.number}>{format.dollars(budget.instanceSpending)}</div>
                <div className={[styles.number, current.instanceSpending > budget.instanceSpending ? styles.overBudget : null].join(' ')}>
                    {format.dollars(current.instanceSpending)}
                </div>
                <div className={styles.number}>{format.dollars(budget.storageSpending)}</div>
                <div className={[styles.number, current.storageSpending > budget.storageSpending ? styles.overBudget : null].join(' ')}>
                    {format.dollars(current.storageSpending)}
                </div>
                <div className={styles.number}>{format.fileSize(budget.storageQuota, {scale: 'G'})}</div>
                <div className={[styles.number, current.storageQuota > budget.storageQuota ? styles.overBudget : null].join(' ')}>
                    {format.fileSize(current.storageQuota, {scale: 'G'})}
                </div>
            </div>
        )
    }
}
