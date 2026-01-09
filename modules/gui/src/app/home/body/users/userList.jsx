import _ from 'lodash'
import memoizeOne from 'memoize-one'
import moment from 'moment'
import PropTypes from 'prop-types'
import React from 'react'
import Highlight from 'react-highlighter'

import {UserResourceUsage} from '~/app/home/user/userResourceUsage'
import format from '~/format'
import {simplifyString, splitString} from '~/string'
import lookStyles from '~/style/look.module.css'
import {msg} from '~/translate'
import {Buttons} from '~/widget/buttons'
import {FastList} from '~/widget/fastList'
import {Icon} from '~/widget/icon'
import {Label} from '~/widget/label'
import {Layout} from '~/widget/layout'
import {Scrollable} from '~/widget/scrollable'
import {SearchBox} from '~/widget/searchBox'
import {Content, SectionLayout} from '~/widget/sectionLayout'
import {SortButton} from '~/widget/sortButton'

import {UserActivity} from './userActivity'
import styles from './userList.module.css'
import {UserStatus} from './userStatus'

const IGNORE = 'IGNORE'

const getHighlightMatcher = memoizeOne(
    filterValues => filterValues.length
        ? new RegExp(`(?:${filterValues.join('|')})`, 'i')
        : ''
)

export class UserList extends React.Component {
    state = {
        sortingOrder: 'updateTime',
        sortingDirection: -1,
        textFilterValues: [],
        statusFilter: IGNORE
    }

    search = React.createRef()

    constructor(props) {
        super(props)
        this.renderUser = this.renderUser.bind(this)
        this.onSelect = this.onSelect.bind(this)
        this.setStatusFilter = this.setStatusFilter.bind(this)
    }

    setSorting(sortingOrder, defaultSortingDirection) {
        this.setState(prevState => {
            const sortingDirection = sortingOrder === prevState.sortingOrder
                ? -prevState.sortingDirection
                : defaultSortingDirection
            return {
                ...prevState,
                sortingOrder,
                sortingDirection
            }
        })
    }

    setTextFilter(textFilterValue) {
        const textFilterValues = splitString(simplifyString(textFilterValue))
        this.setState({textFilterValues})
    }

    setStatusFilter(statusFilter) {
        const {statusFilter: prevStatusFilter} = this.state
        this.setState({statusFilter: statusFilter !== prevStatusFilter ? statusFilter : IGNORE})
    }

    getUsers() {
        const {users} = this.props
        const {sortingOrder, sortingDirection} = this.state
        return _.chain(users)
            .filter(user => this.userMatchesFilters(user))
            .orderBy(user => {
                const item = _.get(user, sortingOrder)
                return _.isString(item) ? simplifyString(item).toUpperCase() : item
            }, sortingDirection === 1 ? 'asc' : 'desc')
            .value()
    }

    userMatchesFilters(user) {
        return this.userMatchesTextFilter(user) && this.userMatchesStatusFilter(user)
    }

    userMatchesTextFilter(user) {
        const {textFilterValues} = this.state
        const searchMatchers = textFilterValues.map(filter => RegExp(filter, 'i'))
        const searchProperties = ['name', 'username', 'email', 'organization', 'intendedUse']
        return textFilterValues
            ? _.every(searchMatchers, matcher =>
                _.find(searchProperties, property =>
                    matcher.test(simplifyString(user[property]))
                )
            )
            : true
    }

    userMatchesStatusFilter(user) {
        const {statusFilter} = this.state
        switch (statusFilter) {
            case 'PENDING':
                return UserStatus.isPending(user.status)
            case 'ACTIVE':
                return UserStatus.isActive(user.status)
            case 'LOCKED':
                return UserStatus.isLocked(user.status)
            case 'OVERBUDGET':
                return this.isUserOverBudget(user)
            case 'BUDGET_UPDATE':
                return this.isUserRequestingBudgetUpdate(user)
            default:
                return true
        }
    }

    isUserOverBudget({quota: {budget, current} = {}}) {
        return budget && current && (
            current.instanceSpending >= budget.instanceSpending && budget.instanceSpending > 0
            || current.storageSpending >= budget.storageSpending && budget.storageSpending > 0
            || current.storageQuota >= budget.storageQuota && budget.storageQuota > 0
        )
    }

    isUserRequestingBudgetUpdate({quota: {budgetUpdateRequest} = {}}) {
        return budgetUpdateRequest
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

    renderColumnHeader({column, label, defaultSortingDirection, classNames = []}) {
        const {sortingOrder, sortingDirection} = this.state
        return (
            <SortButton
                key={column}
                additionalClassName={classNames.join(' ')}
                shape='none'
                label={label}
                sorted={sortingOrder === column}
                sortingDirection={sortingDirection}
                defaultSortingDirection={defaultSortingDirection}
                onChange={sortingDirection => this.setSorting(column, sortingDirection)}
            />
        )
    }

    renderHeader(users) {
        return (
            <div className={[styles.grid, styles.header].join(' ')}>
                <Label className={styles.instanceBudget} msg={msg('user.report.resources.instanceSpending')}/>
                <Label className={styles.storageBudget} msg={msg('user.report.resources.storageSpending')}/>
                <Label className={styles.storage} msg={msg('user.report.resources.storageSpace')}/>
                <div className={styles.info}>
                    {this.renderInfo(users)}
                </div>
                {this.renderColumnHeader({
                    column: 'username',
                    label: msg('user.userDetails.form.username.label'),
                    defaultSortingDirection: 1,
                    classNames: [styles.username]
                })}
                {this.renderColumnHeader({
                    column: 'name',
                    label: msg('user.userDetails.form.name.label'),
                    defaultSortingDirection: 1,
                    classNames: [styles.name]
                })}
                {this.renderColumnHeader({
                    column: 'activity.event',
                    label: msg('user.activity.label'),
                    defaultSortingDirection: 1,
                    classNames: [styles.activity]
                })}
                {this.renderColumnHeader({
                    column: 'updateTime',
                    label: msg('user.userDetails.form.lastUpdate.label'),
                    defaultSortingDirection: -1,
                    classNames: [styles.updateTime]
                })}
                {this.renderColumnHeader({
                    column: 'quota.budget.instanceSpending',
                    label: msg('user.report.resources.max'),
                    defaultSortingDirection: -1,
                    classNames: [styles.instanceBudgetMax, styles.number]
                })}
                {this.renderColumnHeader({
                    column: 'quota.current.instanceSpending',
                    label: msg('user.report.resources.used'),
                    defaultSortingDirection: -1,
                    classNames: [styles.instanceBudgetUsed, styles.number]
                })}
                {this.renderColumnHeader({
                    column: 'quota.budget.storageSpending',
                    label: msg('user.report.resources.max'),
                    defaultSortingDirection: -1,
                    classNames: [styles.storageBudgetMax, styles.number]
                })}
                {this.renderColumnHeader({
                    column: 'quota.current.storageSpending',
                    label: msg('user.report.resources.used'),
                    defaultSortingDirection: -1,
                    classNames: [styles.storageBudgetUsed, styles.number]
                })}
                {this.renderColumnHeader({
                    column: 'quota.budget.storageQuota',
                    label: msg('user.report.resources.max'),
                    defaultSortingDirection: -1,
                    classNames: [styles.storageSpaceMax, styles.number]
                })}
                {this.renderColumnHeader({
                    column: 'quota.current.storageQuota',
                    label: msg('user.report.resources.used'),
                    defaultSortingDirection: -1,
                    classNames: [styles.storageSpaceUsed, styles.number]
                })}
            </div>
        )
    }

    renderTextFilter() {
        return (
            <SearchBox
                placeholder={msg('users.filter.search.placeholder')}
                onSearchValue={searchValue => this.setTextFilter(searchValue)}
            />
        )
    }

    renderStatusFilter() {
        const {statusFilter} = this.state
        const options = [{
            label: msg('users.filter.status.ignore.label'),
            value: IGNORE
        }, {
            label: msg('users.filter.status.pending.label'),
            value: 'PENDING'
        }, {
            label: msg('users.filter.status.active.label'),
            value: 'ACTIVE'
        }, {
            label: msg('users.filter.status.locked.label'),
            value: 'LOCKED'
        }, {
            label: msg('users.filter.status.overbudget.label'),
            value: 'OVERBUDGET'
        }, {
            label: msg('users.filter.status.budgetUpdateRequest.label'),
            value: 'BUDGET_UPDATE'
        }]
        return (
            <Buttons
                chromeless
                layout='horizontal'
                spacing='tight'
                options={options}
                selected={statusFilter}
                onSelect={this.setStatusFilter}
            />
        )
    }

    renderInfo(users) {
        const oneMonthAgo = moment().subtract(1, 'months')
        const lastMonthUserCount = users.filter(user => oneMonthAgo.isBefore(user.updateTime)).length
        return (
            <div className={styles.count}>
                {msg('users.count', {count: users.length, lastMonthUserCount})}
            </div>
        )
    }

    renderUsers(users) {
        const itemKey = user => `${user.id}|${user.username}|${this.getHighlightMatcher()}`
        return (
            <FastList
                items={users}
                itemKey={itemKey}
                itemRenderer={this.renderUser}
                overflow={50}
                onEnter={this.onSelect}
            />
        )
    }

    renderUser(user, hovered) {
        return (
            <UserItem
                user={user}
                highlight={this.getHighlightMatcher()}
                hovered={hovered}
                onClick={this.onSelect}
            />
        )
    }

    getHighlightMatcher() {
        const {textFilterValues} = this.state
        return getHighlightMatcher(textFilterValues)
    }

    onSelect(user) {
        const {onSelect} = this.props
        onSelect(user)
    }

    render() {
        const users = this.getUsers()
        return (
            <SectionLayout>
                <Content horizontalPadding verticalPadding menuPadding>
                    <Layout type='horizontal' spacing='compact'>
                        {this.renderTextFilter()}
                        {this.renderStatusFilter()}
                    </Layout>
                    <Scrollable
                        direction='x'
                        className={styles.users}>
                        {this.renderHeader(users)}
                        {this.renderUsers(users)}
                    </Scrollable>
                </Content>
            </SectionLayout>
        )
    }
}

UserList.propTypes = {
    users: PropTypes.array.isRequired,
    onSelect: PropTypes.func.isRequired
}

class UserItem extends React.PureComponent {
    constructor(props) {
        super(props)
        this.onClick = this.onClick.bind(this)
    }

    onClick() {
        const {user, onClick} = this.props
        user.status ? onClick(user) : null
    }

    render() {
        const {user, hovered} = this.props
        const {username, name, status, admin, googleUser, updateTime, quota: {budget, current, budgetUpdateRequest} = {}, activity} = user
        return (
            <div
                className={[
                    lookStyles.look,
                    lookStyles.transparent,
                    lookStyles.chromeless,
                    lookStyles.noTransitions,
                    styles.grid,
                    styles.user,
                    status ? styles.clickable : null,
                    hovered ? lookStyles.hoverForcedOn : null
                ].join(' ')}
                onClick={this.onClick}>
                {this.renderUsername(username, admin, status, googleUser)}
                {this.renderName(name)}
                {this.renderActivity(activity)}
                {this.renderLastUpdate(updateTime, budgetUpdateRequest)}
                {this.renderInstanceSpendingMax(budget)}
                {this.renderInstanceSpendingUsed(budget, current)}
                {this.renderStorageSpendingMax(budget)}
                {this.renderStorageSpendingUsed(budget, current)}
                {this.renderStorageQuotaMax(budget)}
                {this.renderStorageQuotaUsed(budget, current)}
            </div>
        )
    }

    renderUsername(username, admin, status, googleUser) {
        const {highlight} = this.props
        return (
            <div className={[
                styles.username,
                admin ? styles.admin : null
            ].join(' ')}>
                {status ? this.renderDefinedStatus(status, googleUser) : this.renderUndefinedStatus() }
                <Highlight search={highlight} ignoreDiacritics={true} matchClass={styles.highlight}>{username}</Highlight>
            </div>
        )
    }

    renderName(name) {
        const {highlight} = this.props
        return (
            <Highlight search={highlight} ignoreDiacritics={true} matchClass={styles.highlight}>{name}</Highlight>
        )
    }

    renderDefinedStatus(status, googleUser) {
        return (
            <UserStatus status={status} googleUser={googleUser}/>
        )
    }

    renderUndefinedStatus() {
        return (
            <UserStatus/>
        )
    }

    renderLastUpdate(updateTime, budgetUpdateRequest) {
        return (
            <div style={{display: 'flex', alignItems: 'center', gap: '4px'}}>
                {moment(updateTime).fromNow()}
                {this.renderBudgetUpdateRequest(budgetUpdateRequest)}
            </div>
        )
    }

    renderBudgetUpdateRequest(budgetUpdateRequest) {
        return (
            <div>
                {budgetUpdateRequest ? <Icon name='envelope'/> : null}
            </div>
        )
    }

    renderInstanceSpendingMax(budget = {}) {
        return (
            <div className={styles.number}>
                {format.dollars(budget.instanceSpending)}
            </div>
        )
    }

    renderInstanceSpendingUsed(budget = {}, current = {}) {
        return (
            <UserResourceUsage
                currentValue={current.instanceSpending}
                budgetValue={budget.instanceSpending}
                formattedValue={format.dollars(current.instanceSpending)}
            />
        )
    }

    renderActivity(activity) {
        return (
            <UserActivity activity={activity}/>
        )
    }

    renderStorageSpendingMax(budget = {}) {
        return (
            <div className={styles.number}>
                {format.dollars(budget.storageSpending)}
            </div>
        )
    }

    renderStorageSpendingUsed(budget = {}, current = {}) {
        return (
            <UserResourceUsage
                currentValue={current.storageSpending}
                budgetValue={budget.storageSpending}
                formattedValue={format.dollars(current.storageSpending)}
            />
        )
    }

    renderStorageQuotaMax(budget = {}) {
        return (
            <div className={styles.number}>
                {format.fileSize(budget.storageQuota, {scale: 'G'})}
            </div>
        )
    }

    renderStorageQuotaUsed(budget = {}, current = {}) {
        return (
            <UserResourceUsage
                currentValue={current.storageQuota}
                budgetValue={budget.storageQuota}
                formattedValue={format.fileSize(current.storageQuota, {scale: 'G'})}
            />
        )
    }
}

UserItem.propTypes = {
    highlighter: PropTypes.string,
    hovered: PropTypes.any,
    user: PropTypes.object,
    onClick: PropTypes.func
}
