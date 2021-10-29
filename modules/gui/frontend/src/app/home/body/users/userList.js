import {BottomBar, Content, SectionLayout, TopBar} from 'widget/sectionLayout'
import {Button} from 'widget/button'
import {Buttons} from 'widget/buttons'
import {Layout} from 'widget/layout'
import {Message} from 'widget/message'
import {Pageable} from 'widget/pageable/pageable'
import {Scrollable, ScrollableContainer, Unscrollable} from 'widget/scrollable'
import {SearchBox} from 'widget/searchBox'
import {UserResourceUsage} from 'app/home/user/userResourceUsage'
import {msg} from 'translate'
import Highlight from 'react-highlighter'
import Icon from 'widget/icon'
import Label from 'widget/label'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import format from 'format'
import lookStyles from 'style/look.module.css'
import moment from 'moment'
import styles from './userList.module.css'

export default class UserList extends React.Component {
    state = {
        sortingOrder: 'updateTime',
        sortingDirection: -1,
        textFilterValues: [],
        statusFilter: null
    }

    search = React.createRef()

    setSorting(sortingOrder, defaultSorting) {
        this.setState(prevState => {
            const sortingDirection = sortingOrder === prevState.sortingOrder
                ? -prevState.sortingDirection
                : defaultSorting
            return {
                ...prevState,
                sortingOrder,
                sortingDirection
            }
        })
    }

    setTextFilter(textFilterValues) {
        this.setState({textFilterValues})
    }

    setStatusFilter(statusFilter) {
        this.setState({statusFilter})
    }

    getUsers() {
        const {users} = this.props
        const {sortingOrder, sortingDirection} = this.state
        return _.chain(users)
            .filter(user => this.userMatchesFilters(user))
            .orderBy(user => {
                const item = _.get(user, sortingOrder)
                return _.isString(item) ? item.toUpperCase() : item
            }, sortingDirection === 1 ? 'asc' : 'desc')
            .value()
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
        switch (statusFilter) {
        case 'PENDING':
            return this.isUserPending(user)
        case 'ACTIVE':
            return this.isUserActive(user)
        case 'OVERBUDGET':
            return this.isUserOverBudget(user)
        case 'BUDGET_UPDATE':
            return this.isUserRequestingBudgetUpdate(user)
        default:
            return true
        }
    }

    isUserPending({status}) {
        return status === 'PENDING'
    }
    
    isUserActive({status}) {
        return status === 'ACTIVE'
    }

    isUserOverBudget({quota: {budget, current}}) {
        return current.instanceSpending > budget.instanceSpending
            || current.storageSpending > budget.storageSpending
            || current.storageQuota > budget.storageQuota
    }

    isUserRequestingBudgetUpdate({quota: {budgetUpdateRequest}}) {
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

    getSortingHandleIcon(column, defaultSorting) {
        const {sortingOrder, sortingDirection} = this.state
        return sortingOrder === column
            ? sortingDirection === defaultSorting
                ? 'sort-down'
                : 'sort-up'
            : 'sort'
    }

    renderColumnHeader({column, label, defaultSorting, classNames = []}) {
        const {sortingOrder} = this.state
        return (
            <Button
                chromeless
                look='transparent'
                shape='none'
                content={sortingOrder === column ? 'smallcaps-highlight' : 'smallcaps'}
                label={label}
                icon={this.getSortingHandleIcon(column, defaultSorting)}
                iconPlacement='right'
                additionalClassName={classNames.join(' ')}
                onClick={() => this.setSorting(column, defaultSorting)}/>
        )
    }

    renderHeader() {
        return (
            <div className={[styles.grid, styles.header].join(' ')}>
                <Label className={styles.instanceBudget} msg={msg('user.report.resources.instanceSpending')}/>
                <Label className={styles.storageBudget} msg={msg('user.report.resources.storageSpending')}/>
                <Label className={styles.storage} msg={msg('user.report.resources.storageSpace')}/>
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
                    label: msg('user.userDetails.form.lastUpdate.label'),
                    defaultSorting: -1,
                    classNames: [styles.updateTime]
                })}
                {this.renderColumnHeader({
                    column: 'quota.budget.instanceSpending',
                    label: msg('user.report.resources.max'),
                    defaultSorting: -1,
                    classNames: [styles.instanceBudgetMax, styles.number]
                })}
                {this.renderColumnHeader({
                    column: 'quota.current.instanceSpending',
                    label: msg('user.report.resources.used'),
                    defaultSorting: -1,
                    classNames: [styles.instanceBudgetUsed, styles.number]
                })}
                {this.renderColumnHeader({
                    column: 'quota.budget.storageSpending',
                    label: msg('user.report.resources.max'),
                    defaultSorting: -1,
                    classNames: [styles.storageBudgetMax, styles.number]
                })}
                {this.renderColumnHeader({
                    column: 'quota.current.storageSpending',
                    label: msg('user.report.resources.used'),
                    defaultSorting: -1,
                    classNames: [styles.storageBudgetUsed, styles.number]
                })}
                {this.renderColumnHeader({
                    column: 'quota.budget.storageQuota',
                    label: msg('user.report.resources.max'),
                    defaultSorting: -1,
                    classNames: [styles.storageSpaceMax, styles.number]
                })}
                {this.renderColumnHeader({
                    column: 'quota.current.storageQuota',
                    label: msg('user.report.resources.used'),
                    defaultSorting: -1,
                    classNames: [styles.storageSpaceUsed, styles.number]
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
            label: msg('users.filter.status.overbudget.label'),
            value: 'OVERBUDGET'
        }, {
            label: msg('users.filter.status.budgetUpdateRequest.label'),
            value: 'BUDGET_UPDATE'
        }]
        return (
            <Buttons
                chromeless
                layout='horizontal-nowrap'
                spacing='tight'
                options={options}
                selected={statusFilter}
                onChange={statusFilter => this.setStatusFilter(statusFilter)}
            />
        )
    }

    renderInfo() {
        const results = (count, start, stop, isSinglePage) =>
            isSinglePage
                ? msg('users.count.onePage', {count})
                : msg('users.count.morePages', {count, start, stop})
        return (
            <Pageable.Info>
                {({count, start, stop, isSinglePage}) =>
                    <div className={styles.pageInfo}>
                        {results(count, start, stop, isSinglePage)}
                    </div>
                }
            </Pageable.Info>
        )
    }

    renderUsers() {
        const {onSelect} = this.props
        const {textFilterValues} = this.state
        const highlightMatcher = textFilterValues.length
            ? new RegExp(`(?:${textFilterValues.join('|')})`, 'i')
            : ''
        const key = user => _.compact([user.id, user.username, highlightMatcher]).join('|')
        return (
            <Pageable.Data itemKey={user => key(user)}>
                {user =>
                    <UserItem
                        user={user}
                        highlight={highlightMatcher}
                        onClick={() => onSelect(user)}/>
                }
            </Pageable.Data>
        )
    }

    render() {
        return (
            <Pageable items={this.getUsers()}>
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
                    </Content>
                    <BottomBar className={styles.bottomBar}>
                        <Pageable.Controls/>
                    </BottomBar>
                </SectionLayout>
            </Pageable>
        )
    }
}

UserList.propTypes = {
    users: PropTypes.array.isRequired,
    onSelect: PropTypes.func.isRequired
}

class UserItem extends React.Component {
    render() {
        const {user, onClick} = this.props
        const {status, quota: {budget = {}, current = {}} = {}} = user
        return (
            <div
                className={[
                    lookStyles.look,
                    lookStyles.transparent,
                    lookStyles.chromeless,
                    lookStyles.noTransitions,
                    styles.grid,
                    styles.user,
                    status ? styles.clickable : null
                ].join(' ')}
                onClick={() => status ? onClick() : null}>
                {this.renderName(user)}
                {this.renderStatus(user)}
                {this.renderLastUpdate(user)}
                {this.renderBudgetUpdateRequest(user)}
                {this.renderInstanceSpending(budget, current)}
                {this.renderStorageSpending(budget, current)}
                {this.renderStorageQuota(budget, current)}
            </div>
        )
    }

    renderName({name}) {
        const {highlight} = this.props
        return (
            <div>
                <Highlight search={highlight} ignoreDiacritics={true} matchClass={styles.highlight}>{name}</Highlight>
            </div>
        )
    }

    renderStatus({status}) {
        return (
            <div>
                {status ? this.renderDefinedStatus(status) : this.renderUndefinedStatus() }
            </div>
        )
    }

    renderDefinedStatus(status) {
        return (
            <Message text={msg(`user.userDetails.form.status.${status}`)}/>
        )
    }

    renderUndefinedStatus() {
        return (
            <Icon name='spinner'/>
        )
    }

    renderLastUpdate({updateTime}) {
        return (
            <div>
                {moment(updateTime).fromNow()}
            </div>
        )
    }

    renderBudgetUpdateRequest({quota: {budgetUpdateRequest}}) {
        return (
            <div>
                {budgetUpdateRequest ? <Icon name='envelope'/> : null}
            </div>
        )
    }

    renderInstanceSpending(budget, current) {
        return (
            <React.Fragment>
                <div className={styles.number}>
                    {format.dollars(budget.instanceSpending)}
                </div>
                <UserResourceUsage
                    currentValue={current.instanceSpending}
                    budgetValue={budget.instanceSpending}
                    formattedValue={format.dollars(current.instanceSpending)}
                />
            </React.Fragment>
        )
    }

    renderStorageSpending(budget, current) {
        return (
            <React.Fragment>
                <div className={styles.number}>
                    {format.dollars(budget.storageSpending)}
                </div>
                <UserResourceUsage
                    currentValue={current.storageSpending}
                    budgetValue={budget.storageSpending}
                    formattedValue={format.dollars(current.storageSpending)}
                />
            </React.Fragment>
        )
    }

    renderStorageQuota(budget, current) {
        return (
            <React.Fragment>
                <div className={styles.number}>
                    {format.fileSize(budget.storageQuota, {scale: 'G'})}
                </div>
                <UserResourceUsage
                    currentValue={current.storageQuota}
                    budgetValue={budget.storageQuota}
                    formattedValue={format.fileSize(current.storageQuota, {scale: 'G'})}
                />
            </React.Fragment>
        )
    }
}

UserItem.propTypes = {
    highlighter: PropTypes.string,
    user: PropTypes.object,
    onClick: PropTypes.func
}
