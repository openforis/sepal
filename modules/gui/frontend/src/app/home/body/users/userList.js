import {BottomBar, Content, SectionLayout, TopBar} from 'widget/sectionLayout'
import {Button} from 'widget/button'
import {Buttons} from 'widget/buttons'
import {Layout} from 'widget/layout'
import {Pageable} from 'widget/pageable/pageable'
import {Scrollable, ScrollableContainer, Unscrollable} from 'widget/scrollable'
import {SearchBox} from 'widget/searchBox'
import {msg} from 'translate'
import Highlight from 'react-highlighter'
import Icon from 'widget/icon'
import Label from 'widget/label'
import PropTypes from 'prop-types'
import React from 'react'
import Tooltip from 'widget/tooltip'
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
                    label: msg('user.userDetails.form.lastUpdate.label'),
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
            label: msg('users.filter.status.overbudget.label'),
            value: 'OVERBUDGET'
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

const Usage = ({currentValue, budgetValue, formattedValue}) => {
    const percentage = Math.round(100 * currentValue / budgetValue)
    const overbudget = currentValue > budgetValue
    const usage = Math.min(currentValue / budgetValue, 1)
    return (
        <div className={styles.number}>
            <Tooltip
                className={[overbudget ? styles.overBudget : null].join(' ')}
                msg={msg('user.report.usage', {percentage})}
                delay={.25}
                placement='top'
            >
                <div className={styles.usage} style={{'--usage': `${usage}`}}>
                    {formattedValue}
                </div>
            </Tooltip>
        </div>
    )
}
class UserItem extends React.Component {
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
                    lookStyles.noTransitions,
                    styles.grid,
                    styles.user,
                    status ? styles.clickable : null
                ].join(' ')}
                onClick={() => status ? onClick() : null}
            >
                <div><Highlight search={highlight} ignoreDiacritics={true} matchClass={styles.highlight}>{name}</Highlight></div>
                <div>{status ? msg(`user.userDetails.form.status.${status}`) : <Icon name='spinner'/>}</div>
                <div>{moment(updateTime).fromNow()}</div>

                {this.renderInstanceSpending(budget, current)}
                {this.renderStorageSpending(budget, current)}
                {this.renderStorageQuota(budget, current)}

            </div>
        )
    }

    renderInstanceSpending(budget, current) {
        return (
            <React.Fragment>
                <div className={styles.number}>{format.dollars(budget.instanceSpending)}</div>
                <Usage
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
                <div className={styles.number}>{format.dollars(budget.storageSpending)}</div>
                <Usage
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
                <div className={styles.number}>{format.fileSize(budget.storageQuota, {scale: 'G'})}</div>
                <Usage
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
