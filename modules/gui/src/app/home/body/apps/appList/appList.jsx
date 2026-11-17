import _ from 'lodash'
import memoizeOne from 'memoize-one'
import PropTypes from 'prop-types'
import React from 'react'

import {actionBuilder} from '~/action-builder'
import {userDetailsHint} from '~/app/home/user/userDetails'
import {isAppListed, unavailableReason} from '~/appAvailability'
import {loadApps$} from '~/apps'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {select} from '~/store'
import {simplifyString, splitString} from '~/string'
import {msg} from '~/translate'
import {isServiceAccount} from '~/user'
import {currentUser} from '~/user'
import {Button} from '~/widget/button'
import {Buttons} from '~/widget/buttons'
import {CrudItem} from '~/widget/crudItem'
import {FastList} from '~/widget/fastList'
import {Layout} from '~/widget/layout'
import {ListItem} from '~/widget/listItem'
import {Notifications} from '~/widget/notifications'
import {CenteredProgress} from '~/widget/progress'
import {Scrollable} from '~/widget/scrollable'
import {SearchBox} from '~/widget/searchBox'
import {Content, SectionLayout} from '~/widget/sectionLayout'
import {Tag} from '~/widget/tag'

import {appRequirements} from '../instanceSuitability'
import {AppAdmin} from './appAdmin'
import {AppDetails, retirementNotice} from './appDetails'
import {AppItem} from './appItem'
import styles from './appList.module.css'

const IGNORE = 'IGNORE'

const mapStateToProps = () => ({
    apps: select('apps.list'),
    tags: select('apps.tags'),
    tabs: select('apps.tabs'),
    filterValue: select('apps.filterValue'),
    filterValues: select('apps.filterValues') || [],
    tagFilter: select('apps.tagFilter') || IGNORE,
    user: currentUser()
})

const getHighlightMatcher = memoizeOne(
    filterValues => filterValues.length
        ? new RegExp(`(?:${filterValues.join('|')})`, 'i')
        : ''
)

class _AppList extends React.Component {
    state = {
        app: null,
        adminApp: null
    }

    constructor(props) {
        super(props)
        this.closeAppDetails = this.closeAppDetails.bind(this)
        this.closeAppAdmin = this.closeAppAdmin.bind(this)
        this.setFilter = this.setFilter.bind(this)
        this.setTagFilter = this.setTagFilter.bind(this)
        this.userDetailsHint = this.userDetailsHint.bind(this)
        this.renderApp = this.renderApp.bind(this)
        this.handleSelect = this.handleSelect.bind(this)
    }

    render() {
        return (
            <SectionLayout>
                <Content className={styles.container} horizontalPadding verticalPadding menuPadding>
                    {this.isLoading()
                        ? this.renderProgress()
                        : this.renderAppList()}
                    {this.renderAppDetails()}
                    {this.renderAppAdmin()}
                </Content>
            </SectionLayout>
        )
    }

    getHighlightMatcher() {
        const {filterValues} = this.props
        return getHighlightMatcher(filterValues)
    }

    closeAppDetails() {
        this.setState({app: null})
    }

    closeAppAdmin() {
        this.setState({adminApp: null})
    }

    renderAppDetails() {
        const {app} = this.state
        return app
            ? <AppDetails app={app} onClose={this.closeAppDetails}/>
            : null
    }

    renderAppAdmin() {
        const {adminApp} = this.state
        return adminApp
            ? <AppAdmin app={adminApp} onClose={this.closeAppAdmin}/>
            : null
    }

    renderProgress() {
        return <CenteredProgress title={msg('apps.loading.progress')}/>
    }

    renderAppList() {
        const apps = this.getApps()
        const itemKey = app => `${app.path}|${this.getHighlightMatcher()}`
        return this.hasData()
            ? (
                <Layout type='vertical' spacing='compact' shrink>
                    <div className={styles.header}>
                        {this.renderHeader(apps)}
                    </div>
                    <Scrollable
                        direction='x'
                        className={styles.apps}>
                        <FastList
                            items={apps}
                            itemKey={itemKey}
                            itemRenderer={this.renderApp}
                            spacing='tight'
                            overflow={50}
                            onEnter={this.handleSelect}
                        />
                    </Scrollable>
                </Layout>
            )
            : null
    }

    handleSelect(app) {
        const {onSelect} = this.props
        this.isAvailable(app) && onSelect(app)
    }

    renderHeader(apps) {
        const {tags} = this.props
        return (
            <Layout
                type='vertical'
                spacing='compact'>
                {this.renderSearch()}
                <Layout type='horizontal' spacing='compact'>
                    {this.renderInfo(apps)}
                    {this.renderTagFilter(tags)}
                </Layout>
            </Layout>
        )
    }

    renderSearch() {
        const {filterValue} = this.props
        return (
            <SearchBox
                value={filterValue}
                placeholder={msg('apps.filter.search.placeholder')}
                onSearchValue={this.setFilter}
            />
        )
    }

    renderInfo(apps) {
        return (
            <div className={styles.count}>
                {msg('apps.count', {count: apps.length})}
            </div>
        )
    }

    renderTagFilter(tags) {
        const {tagFilter} = this.props
        const toOption = ({label, value, icon, tooltip}) => ({
            label,
            value,
            ...(icon ? {icon} : {}),
            ...(tooltip ? {tooltip} : {})
        })
        const options = [
            {
                label: msg('apps.filter.tag.ignore.label'),
                value: IGNORE
            },
            ...tags.map(toOption)
        ]
        return (
            <Buttons
                chromeless
                layout='horizontal'
                spacing='tight'
                options={options}
                selected={tagFilter}
                onSelect={this.setTagFilter}
            />
        )
    }

    renderChip(app) {
        return this.renderUnavailableChip(app)
            || this.renderRunningChip(app)
            || this.renderGpuRequiredChip(app)
            || this.renderNoInstanceRequiredChip(app)
    }

    renderUnavailableChip(app) {
        switch (this.unavailableReason(app)) {
            case 'retired':
                return this.renderReasonChip(app, {icon: 'box-archive', label: msg('apps.retired.label')})
            case 'googleAccountRequired':
                return this.renderReasonChip(app, {
                    icon: 'google',
                    iconType: 'brands',
                    label: msg('apps.googleAccount.label'),
                    tooltipOnVisible: this.userDetailsHint
                })
            default:
                return null
        }
    }

    renderReasonChip(app, {icon, iconType, label, tooltipOnVisible}) {
        return (
            <Tag
                key={'unavailableChip'}
                size='small'
                icon={icon}
                iconType={iconType}
                label={label}
                tooltip={this.unavailableMessage(app)}
                tooltipPlacement='left'
                tooltipOnVisible={tooltipOnVisible}
            />
        )
    }

    userDetailsHint(visible) {
        return userDetailsHint(visible)
    }

    renderRunningChip(app) {
        const {onShowRunning} = this.props
        return app.running
            ? (
                <Button
                    key={'runningChip'}
                    shape='pill'
                    size='small'
                    look='add'
                    icon='play'
                    label={msg('apps.running.label')}
                    additionalClassName={styles.running}
                    onClick={() => onShowRunning(app.running)}
                />
            )
            : null
    }

    renderNoInstanceRequiredChip(app) {
        return this.isDockerApp(app)
            ? (
                <Tag
                    key={'noInstanceRequiredChip'}
                    size='small'
                    icon='bolt'
                    label={msg('apps.noInstanceRequired')}
                    tooltip={msg('apps.noInstanceRequiredTooltip')}
                    tooltipPlacement='left'
                />
            )
            : null
    }

    renderGpuRequiredChip(app) {
        const {minGpuCount} = appRequirements(app)
        return minGpuCount
            ? (
                <Tag
                    key={'gpuRequiredChip'}
                    size='small'
                    icon='microchip'
                    label={minGpuCount > 1 ? `${minGpuCount}× GPU` : 'GPU'}
                    tooltip={msg('apps.gpuRequiredTooltip', {count: minGpuCount})}
                    tooltipPlacement='left'
                />
            )
            : null
    }

    renderAppAdminButton(app) {
        if (!this.isUserAdmin()) {
            return null
        }
        const configurable = this.isDockerApp(app)
        // An invisible gear on apps without settings keeps every admin row's chips in line.
        return (
            <Button
                key={'dockerAdminButton'}
                look='default'
                shape='circle'
                size='small'
                icon='cog'
                iconSize='xs'
                additionalClassName={configurable ? null : styles.placeholder}
                disabled={!configurable}
                tooltip={configurable ? msg('apps.admin.tooltip') : null}
                tooltipPlacement='left'
                onClick={configurable ? e => {
                    e.stopPropagation()
                    this.showAdmin(app)
                } : null}
            />
        )
    }

    renderApp(app, hovered) {
        const {onSelect} = this.props
        // An unclickable ListItem ignores the pointer; interactive keeps the info button and chip tooltips of an unavailable row working.
        return (
            <ListItem
                hovered={hovered}
                expansionInteractive={!this.isAvailable(app)}
                onClick={this.isAvailable(app) ? () => onSelect(app) : null}>
                <CrudItem
                    infoTooltip={msg('apps.info')}
                    tooltipPlacement='left'
                    inlineComponents={[
                        this.renderChip(app),
                        this.renderAppAdminButton(app)
                    ]}
                    infoDisabled={false}
                    onInfo={() => this.showInfo(app)}>
                    <AppItem
                        app={app}
                        highlight={this.getHighlightMatcher()}
                        unavailable={!this.isAvailable(app)}
                    />
                </CrudItem>
            </ListItem>
        )
    }

    unavailableReason(app) {
        return unavailableReason(app, {serviceAccount: isServiceAccount()})
    }

    unavailableMessage(app) {
        switch (this.unavailableReason(app)) {
            case 'retired':
                return retirementNotice(app)
            case 'disabled':
                return msg('apps.unavailable.disabled')
            case 'googleAccountRequired':
                return msg('apps.unavailable.googleAccountRequired')
            default:
                return null
        }
    }

    isAvailable(app) {
        return !this.unavailableReason(app)
    }

    isDockerApp(app) {
        return (app.endpoint && app.endpoint.includes('docker')) || !!app.containerApp
    }

    isUserAdmin() {
        const {user} = this.props
        return user && user.admin
    }

    showInfo(app) {
        this.setState({app})
    }

    showAdmin(adminApp) {
        this.setState({adminApp})
    }

    getApps() {
        const {apps, filterValues} = this.props
        const searchMatchers = filterValues.map(filter => RegExp(filter, 'i'))
        const now = new Date()
        return _.chain(apps)
            .filter(app => isAppListed(app, now))
            .filter(app => this.appMatchesFilters(app, searchMatchers))
            .map(app => ({...app, running: this.isRunning(app)}))
            .value()
    }

    isRunning(app) {
        const {tabs} = this.props
        return _.find(tabs, tab => tab.path === app.path)
    }

    appMatchesFilters(app, searchMatchers) {
        return this.appMatchesFilterValues(app, searchMatchers) && this.appMatchesTagFilter(app)
    }

    appMatchesTagFilter(app) {
        const {tagFilter} = this.props
        return tagFilter === IGNORE || app.tags.includes(tagFilter)
    }

    appMatchesFilterValues(app, searchMatchers) {
        const searchProperties = ['label', 'tagline']
        return searchMatchers.length
            ? _.every(searchMatchers, matcher =>
                _.find(searchProperties, property =>
                    matcher.test(simplifyString(app[property]))
                )
            )
            : true
    }

    isLoading() {
        const {apps, stream} = this.props
        return !apps && stream('LOAD_APPS').active
    }

    hasData() {
        const {apps} = this.props
        return apps && apps.length
    }

    setFilter(filterValue) {
        const filterValues = splitString(simplifyString(filterValue))
        actionBuilder('UPDATE_FILTER_VALUE', filterValue)
            .set('apps.filterValue', filterValue)
            .set('apps.filterValues', filterValues)
            .dispatch()
    }

    setTagFilter(tagFilter) {
        const {tagFilter: prevTagFilter} = this.props
        actionBuilder('UPDATE_TAG_FILTER', tagFilter)
            .set('apps.tagFilter', tagFilter !== prevTagFilter ? tagFilter : IGNORE)
            .dispatch()
    }

    componentDidMount() {
        const {apps, stream} = this.props
        if (!apps) {
            stream('LOAD_APPS',
                loadApps$(),
                null,
                () => Notifications.error({message: msg('apps.loading.error')})
            )
        }
    }
}

export const AppList = compose(
    _AppList,
    connect(mapStateToProps)
)

AppList.propTypes = {
    onSelect: PropTypes.func.isRequired,
    onShowRunning: PropTypes.func.isRequired
}
