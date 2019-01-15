import {Button, ButtonGroup} from 'widget/button'
import {Content, SectionLayout, TopBar} from 'widget/sectionLayout'
import {PageControls, PageData, PageInfo, Pageable} from 'widget/pageable'
import {Scrollable, ScrollableContainer, Unscrollable} from 'widget/scrollable'
import {connect} from 'store'
import {map, share, zip} from 'rxjs/operators'
import {msg} from 'translate'
import Highlight from 'react-highlighter'
import Icon from 'widget/icon'
import Notifications from 'app/notifications'
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
        filter: '',
        userDetails: null
    }

    search = React.createRef()

    componentDidMount() {
        const setUserList = userList =>
            this.setState(prevState => ({
                ...prevState,
                users: this.getSortedUsers(userList)
            }))

        const mergeBudgetReport = budgetReport =>
            this.setState(prevState => ({
                ...prevState,
                users: _.map(prevState.users, user => ({
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

        this.search.current.focus()
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

    editUser(user) {
        this.setState(prevState => ({
            ...prevState,
            userDetails: {
                username: user.username,
                name: user.name,
                email: user.email,
                organization: user.organization,
                monthlyBudgetInstanceSpending: user.report.budget.instanceSpending,
                monthlyBudgetStorageSpending: user.report.budget.storageSpending,
                monthlyBudgetStorageQuota: user.report.budget.storageQuota
            }
        }))
    }

    inviteUser() {
        this.setState(prevState => ({
            ...prevState,
            userDetails: {
                newUser: true,
                monthlyBudgetInstanceSpending: 1,
                monthlyBudgetStorageSpending: 1,
                monthlyBudgetStorageQuota: 20
            }
        }))
    }

    cancelUser() {
        this.setState(prevState => ({
            ...prevState,
            userDetails: null
        }))
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
        }) => api.user.updateUserBudget$({username, instanceSpending, storageSpending, storageQuota})

        const updateLocalState = userDetails =>
            this.setState(prevState => {
                const users = prevState.users
                if (userDetails) {
                    const index = users.findIndex(user => user.username === userDetails.username)
                    index === -1
                        ? users.push(userDetails)
                        : users[index] = userDetails
                }
                return {
                    ...prevState,
                    users: this.getSortedUsers(users)
                }
            })

        const removeFromLocalState = userDetails =>
            this.setState(prevState => {
                const users = prevState.users
                if (userDetails) {
                    _.remove(users, user => user.username === userDetails.username)
                }
                return {
                    ...prevState,
                    users
                }
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
                Notifications.success('user.userDetails.update').dispatch()
            },
            error => {
                removeFromLocalState(userDetails)
                Notifications.caught('user.userDetails.update', {}, error).dispatch()
            }
        )
    }

    renderSortingHandle(sorting) {
        return this.state.sortingOrder === sorting
            ? this.state.sortingDirection === 1
                ? <Icon name={'sort-down'}/>
                : <Icon name={'sort-up'}/>
            : <Icon name={'sort'}/>
    }

    renderColumnHeader(column, label, className) {
        return (
            <div className={[styles[column], styles[className]].join(' ')}>
                <Button
                    chromeless
                    shape='none'
                    additionalClassName='itemType'
                    onClick={() => this.setSorting(column)}>
                    {label}
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
                {this.renderColumnHeader('name', msg('user.userDetails.form.name.label'))}
                {this.renderColumnHeader('status', msg('user.userDetails.form.status.label'))}

                <div className={[styles.instanceBudget, styles.group].join(' ')}>
                    {msg('user.report.resources.monthlyInstance')}
                </div>

                <div className={[styles.storageBudget, styles.group].join(' ')}>
                    {msg('user.report.resources.monthlyStorage')}
                </div>

                <div className={[styles.storage, styles.group].join(' ')}>
                    {msg('user.report.resources.storage')}
                </div>

                {this.renderColumnHeader('updateTime', msg('user.userDetails.form.updateTime.label'))}
                {this.renderColumnHeader('report.budget.instanceSpending', msg('user.report.resources.quota'), 'number')}
                {this.renderColumnHeader('report.month.instanceSpending', msg('user.report.resources.used'), 'number')}
                {this.renderColumnHeader('report.budget.storageSpending', msg('user.report.resources.quota'), 'number')}
                {this.renderColumnHeader('report.month.storageSpending', msg('user.report.resources.used'), 'number')}
                {this.renderColumnHeader('report.budget.storageQuota', msg('user.report.resources.quota'), 'number')}
                {this.renderColumnHeader('report.month.storageQuota', msg('user.report.resources.used'), 'number')}
            </div>
        )
    }

    renderControls() {
        return (
            <div className={styles.pageControls}>
                <ButtonGroup wrap={true}>
                    <Button
                        look='transparent'
                        size='large'
                        shape='pill'
                        disabled={true}>
                        <input
                            className={styles.search}
                            type='text'
                            ref={this.search}
                            value={this.state.filter}
                            placeholder={msg('users.filter.placeholder')}
                            onChange={e => this.setFilter(e.target.value)}/>
                    </Button>
                </ButtonGroup>
                <div className={styles.pageNavigation}>
                    <PageControls/>
                </div>
            </div>
        )
    }

    renderInviteUser() {
        return (
            <div className={styles.inviteUser}>
                <Button
                    look='add'
                    size='large'
                    shape='pill'
                    icon='plus'
                    label={msg('users.invite.label')}
                    onClick={() => this.inviteUser()}/>
            </div>
        )
    }

    renderInfo() {
        const {filter} = this.state
        const results = count => filter
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
                {(user, index) =>
                    <User
                        key={user.username || user.id || index}
                        user={user}
                        highlight={this.state.filter}
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
            <div tabIndex='0' onKeyDown={e => this.onKeyDown(e)}>
                <Pageable
                    items={this.getFilteredUsers()}
                    watch={[this.state.sortingOrder, this.state.sortingDirection, this.state.filter]}
                    limit={20}>
                    <SectionLayout>
                        <TopBar>
                            {this.renderControls()}
                        </TopBar>
                        <Content>
                            <ScrollableContainer>
                                <Unscrollable>
                                    {this.renderInviteUser()}
                                    {this.renderInfo()}
                                </Unscrollable>
                                <Scrollable direction='x'>
                                    <ScrollableContainer className={styles.content}>
                                        <Unscrollable>
                                            <div className={[styles.heading, 'itemType'].join(' ')}>
                                                {this.renderHeader()}
                                            </div>
                                        </Unscrollable>
                                        <Scrollable direction='y' className={styles.users}>
                                            {this.renderUsers()}
                                        </Scrollable>
                                    </ScrollableContainer>
                                </Scrollable>
                            </ScrollableContainer>
                        </Content>
                    </SectionLayout>
                </Pageable>
                {this.renderUserDetails()}
            </div>
        )
    }
}

export default connect()(Users)

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
            // <Button
            //     chromeless
            //     look='transparent'
            //     // size='large'
            //     onClick={() => status ? onClick() : null}>
            //     <div className={styles.grid}>
            //         <div><Highlight search={highlight} matchClass={styles.highlight}>{name}</Highlight></div>
            //         <div>{msg(`user.userDetails.form.status.${status}`) || <Icon name='spinner'/>}</div>
            //         <div>{moment(updateTime).fromNow()}</div>
            //         <div className={styles.number}>{format.dollars(budget.instanceSpending)}</div>
            //         <div className={styles.number}>{format.dollars(current.instanceSpending)}</div>
            //         <div className={styles.number}>{format.dollars(budget.storageSpending)}</div>
            //         <div className={styles.number}>{format.dollars(current.storageSpoending)}</div>
            //         <div className={styles.number}>{format.fileSize(budget.storageQuota, {scale: 'G'})}</div>
            //         <div className={styles.number}>{format.fileSize(current.storageQuota, {scale: 'G'})}</div>
            //     </div>
            // </Button>
            <div
                className={[
                    lookStyles.look,
                    lookStyles.transparent,
                    lookStyles.chromeless,
                    styles.grid, status ? styles.clickable : null
                ].join(' ')}
                onClick={() => status ? onClick() : null}>
                <div><Highlight search={highlight} matchClass={styles.highlight}>{name}</Highlight></div>
                <div>{status ? msg(`user.userDetails.form.status.${status}`) : <Icon name='spinner'/>}</div>
                <div>{moment(updateTime).fromNow()}</div>
                <div className={styles.number}>{format.dollars(budget.instanceSpending)}</div>
                <div className={styles.number}>{format.dollars(current.instanceSpending)}</div>
                <div className={styles.number}>{format.dollars(budget.storageSpending)}</div>
                <div className={styles.number}>{format.dollars(current.storageSpoending)}</div>
                <div className={styles.number}>{format.fileSize(budget.storageQuota, {scale: 'G'})}</div>
                <div className={styles.number}>{format.fileSize(current.storageQuota, {scale: 'G'})}</div>
            </div>
        )
    }
}
