import {BottomBar, Content, SectionLayout, TopBar} from 'widget/sectionLayout'
import {Button} from 'widget/button'
import {Buttons} from 'widget/buttons'
import {PageControls, PageData, PageInfo, Pageable} from 'widget/pageable'
import {Scrollable, ScrollableContainer, Unscrollable} from 'widget/scrollable'
import {Shape} from 'widget/shape'
import {compose} from 'compose'
import {connect} from 'store'
import {map, share, zip} from 'rxjs/operators'
import {msg} from 'translate'
import Highlight from 'react-highlighter'
import Icon from 'widget/icon'
import Label from 'widget/label'
import Notifications from 'widget/notifications'
import React from 'react'
import UserDetails from './user'
import _ from 'lodash'
import api from 'api'
import escapeStringRegexp from 'escape-string-regexp'
import format from 'format'
import lookStyles from 'style/look.module.css'
import moment from 'moment'
import styles from './users.module.css'

const getUserList$ = () => api.user.getUserList$().pipe(
    share()
)

const getBudgetReport$ = () => api.user.getBudgetReport$().pipe(
    zip(getUserList$()),
    map(([budgetReport]) => budgetReport)
)

class Users extends React.Component {
    state = {
        users: [],
        sortingOrder: 'updateTime',
        sortingDirection: -1,
        textFilter: '',
        budgetFilter: false,
        budgetFilterRegexp: null,
        userDetails: null
    }

    search = React.createRef()

    componentDidMount() {
        const setUserList = userList =>
            this.setState({
                users: this.getSortedUsers(userList)
            })

        const mergeBudgetReport = budgetReport =>
            this.setState(({users}) => ({
                users: _.map(users, user => ({
                    ...user,
                    report: budgetReport[user.username || {}]
                }))
            }))

        this.props.stream('LOAD_USER_LIST',
            getUserList$(),
            userList => setUserList(userList)
        )
        this.props.stream('LOAD_BUDGET_REPORT',
            getBudgetReport$(),
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
        return _.orderBy(users, user => {
            const item = _.get(user, sortingOrder)
            return _.isString(item) ? item.toUpperCase() : item
        }, sortingDirection === 1 ? 'asc' : 'desc')
    }

    setTextFilter(textFilter) {
        this.setState({
            textFilter,
            textFilterRegexp: RegExp(escapeStringRegexp(textFilter), 'i')
        })
    }

    setBudgetFilter(budgetFilter) {
        this.setState({budgetFilter})
    }

    getFilteredUsers() {
        const {users} = this.state
        return users
            .filter(user => this.userMatchesTextFilter(user))
            .filter(user => this.userMatchesBudgetFilter(user))
    }

    userMatchesTextFilter(user) {
        const {textFilter, textFilterRegexp} = this.state
        const searchProperties = ['name', 'username', 'email', 'organization']
        return textFilter
            ? _.find(searchProperties, searchProperty =>
                textFilterRegexp.test(user[searchProperty])
            )
            : true
    }

    userMatchesBudgetFilter(user) {
        const {budgetFilter} = this.state
        return budgetFilter
            ? this.isUserOverBudget(user)
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
                this.setTextFilter('')
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

    renderSortingHandle(column) {
        return this.state.sortingOrder === column
            ? this.state.sortingDirection === 1
                ? <Icon name={'sort-down'}/>
                : <Icon name={'sort-up'}/>
            : <Icon name={'sort'}/>
    }

    renderColumnHeader(column, label, classNames = []) {
        const {sortingOrder} = this.state
        return (
            <div className={classNames.join(' ')}>
                <Button
                    chromeless
                    shape='none'
                    additionalClassName='itemType'
                    onClick={() => this.setSorting(column)}>
                    <span className={sortingOrder === column ? styles.sorted : null}>
                        {label}
                    </span>
                    <span className={styles.sortingHandle}>
                        {this.renderSortingHandle(column)}
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
                {this.renderColumnHeader('name', msg('user.userDetails.form.name.label'), [styles.name])}
                {this.renderColumnHeader('status', msg('user.userDetails.form.status.label'), [styles.status])}
                {this.renderColumnHeader('updateTime', msg('user.userDetails.form.updateTime.label'), [styles.updateTime])}
                {this.renderColumnHeader('report.budget.instanceSpending', msg('user.report.resources.quota'), [styles.instanceBudgetQuota, styles.number])}
                {this.renderColumnHeader('report.current.instanceSpending', msg('user.report.resources.used'), [styles.instanceBudgetUsed, styles.number])}
                {this.renderColumnHeader('report.budget.storageSpending', msg('user.report.resources.quota'), [styles.storageBudgetQuota, styles.number])}
                {this.renderColumnHeader('report.current.storageSpending', msg('user.report.resources.used'), [styles.storageBudgetUsed, styles.number])}
                {this.renderColumnHeader('report.budget.storageQuota', msg('user.report.resources.quota'), [styles.storageQuota, styles.number])}
                {this.renderColumnHeader('report.current.storageQuota', msg('user.report.resources.used'), [styles.storageUsed, styles.number])}
            </div>
        )
    }

    renderTextFilter() {
        const {textFilter} = this.state
        return (
            <Shape
                look='transparent'
                size='large'
                shape='pill'
                icon='search'>
                <input
                    className={styles.search}
                    type='search'
                    ref={this.search}
                    value={textFilter}
                    placeholder={msg('users.filter.search.placeholder')}
                    onChange={e => this.setTextFilter(e.target.value)}/>
            </Shape>
        )
    }

    renderBudgetFilter() {
        const {budgetFilter} = this.state
        const options = [{
            label: msg('users.filter.budget.ignore.label'),
            value: false
        }, {
            label: msg('users.filter.budget.over.label'),
            value: true
        }]
        return (
            <Buttons
                chromeless
                type='horizontal-tight'
                options={options}
                selected={budgetFilter}
                onChange={budgetFilter => this.setState({budgetFilter})}
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
        const {textFilter, budgetFilter, users} = this.state
        const isFiltered = textFilter || budgetFilter
        const results = (count, total) =>
            msg(isFiltered ? 'users.countWithFilter' : 'users.countNoFilter', {count, total})
        return (
            <PageInfo>
                {({itemCount}) =>
                    <div className={styles.pageInfo}>
                        {results(itemCount, users.length)}
                    </div>
                }
            </PageInfo>
        )
    }

    renderUsers() {
        const {textFilter} = this.state
        return (
            <PageData itemKey={user => user.username || user.id}>
                {user =>
                    <User
                        user={user}
                        highlight={textFilter}
                        onClick={() => this.editUser(user)}/>
                }
            </PageData>
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
        return (
            <React.Fragment>
                <div
                    className={styles.container}
                    tabIndex='0'
                    onKeyDown={e => this.onKeyDown(e)}>
                    <Pageable items={this.getFilteredUsers()}>
                        <SectionLayout>
                            <TopBar label={msg('home.sections.users')}/>
                            <Content horizontalPadding verticalPadding menuPadding>
                                <ScrollableContainer>
                                    <Unscrollable className={styles.filters}>
                                        {this.renderTextFilter()}
                                        {this.renderBudgetFilter()}
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
                                <PageControls/>
                            </BottomBar>
                        </SectionLayout>
                    </Pageable>
                </div>
                {this.renderUserDetails()}
            </React.Fragment>
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
                <div><Highlight search={highlight} matchClass={styles.highlight}>{name}</Highlight></div>
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
