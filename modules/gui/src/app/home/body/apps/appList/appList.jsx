import _ from 'lodash'
import memoizeOne from 'memoize-one'
import PropTypes from 'prop-types'
import React from 'react'

import {actionBuilder} from '~/action-builder'
import {userDetailsHint} from '~/app/home/user/userDetails'
import api from '~/apiRegistry'
import {loadApps$} from '~/apps'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {select} from '~/store'
import {simplifyString, splitString} from '~/string'
import {getLanguage, msg} from '~/translate'
import {isServiceAccount} from '~/user'
import {currentUser} from '~/user'
import {Button} from '~/widget/button'
import {Buttons} from '~/widget/buttons'
import {CrudItem} from '~/widget/crudItem'
import {FastList} from '~/widget/fastList'
import {Icon} from '~/widget/icon'
import {Layout} from '~/widget/layout'
import {ListItem} from '~/widget/listItem'
import {Notifications} from '~/widget/notifications'
import {CenteredProgress} from '~/widget/progress'
import {SearchBox} from '~/widget/searchBox'
import {Content, SectionLayout} from '~/widget/sectionLayout'
import {Tag} from '~/widget/tag'

import {AppAdmin} from './appAdmin'
import {AppDetails} from './appDetails'
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
    googleAccountFilter: select('apps.googleAccountFilter'),
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
        this.toggleGoogleAccountFilter = this.toggleGoogleAccountFilter.bind(this)
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
                <Layout type='vertical' spacing='compact'>
                    <div className={styles.header}>
                        {this.renderHeader(apps)}
                    </div>
                    <FastList
                        items={apps}
                        itemKey={itemKey}
                        itemRenderer={this.renderApp}
                        spacing='tight'
                        overflow={50}
                        onEnter={this.handleSelect}
                    />
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
                <Layout type='horizontal' spacing='compact'>
                    {this.renderSearch()}
                    {this.renderGoogleAccountFilter()}
                </Layout>
                <Layout type='horizontal' spacing='compact'>
                    {this.renderInfo(apps)}
                    {this.renderTagFilter(tags)}
                </Layout>
                <Layout type='horizontal'>
                    {this.renderRefreshProxiesButton()}
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

    renderGoogleAccountFilter() {
        const {googleAccountFilter} = this.props
        return isServiceAccount() ? (
            <Button
                look={googleAccountFilter ? 'cancel' : 'default'}
                shape='pill'
                icon='google'
                iconType='brands'
                label={googleAccountFilter ? 'Hide unavailable' : 'Show unavailable'}
                tooltip={msg('apps.googleAccountRequired')}
                tooltipPlacement='left'
                tooltipOnVisible={this.userDetailsHint}
                onClick={this.toggleGoogleAccountFilter}
            />
        ) : null
    }

    renderRefreshProxiesButton() {
        return this.isUserAdmin() ? (
            <Button
                shape='pill'
                icon='sync-alt'
                label={msg('apps.refreshProxies.label')}
                tooltip={msg('apps.refreshProxies.tooltip')}
                onClick={this.refreshProxies}
            />
        ) : null
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
        const toOption = ({label, value}) => ({
            label: label[getLanguage()]
                || label['en']
                || Object.values(label)[0],
            value
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

    renderGoogleAccountRequiredButton(app) {
        return this.isDisallowed(app)
            ? (
                <Button
                    key={'renderGoogleAccountRequiredButton'}
                    look='cancel'
                    shape='circle'
                    icon='google'
                    iconType='brands'
                    iconStyle='warning'
                    tooltip={msg('apps.googleAccountRequired')}
                    tooltipPlacement='left'
                    tooltipOnVisible={this.userDetailsHint}
                />
            )
            : null
    }

    userDetailsHint(visible) {
        return userDetailsHint(visible)
    }

    renderAppRunningIcon() {
        return (
            <Icon
                key={'statusIcon'}
                name='circle'
                size='xs'
                variant='info'
                tooltip={msg('apps.running')}
                tooltipPlacement='left'
            />
        )
    }

    renderAppStoppedIcon() {
        return (
            <Icon
                key={'statusIcon'}
                name='circle'
                type='regular'
                size='xs'
                variant='info'
                tooltip={msg('apps.notRunning')}
                tooltipPlacement='left'
            />
        )
    }

    renderStatusIcon(app) {
        return app.running
            ? this.renderAppRunningIcon()
            : this.renderAppStoppedIcon()
    }

    renderNoInstanceRequiredChip(app) {
        return this.isDockerApp(app)
            ? (
                <Tag
                    key={'noInstanceRequiredChip'}
                    size='small'
                    label={msg('apps.noInstanceRequired')}
                />
            )
            : null
    }

    renderAppAdminButton(app) {
        return this.isDockerApp(app) && this.isUserAdmin()
            ? (
                <Button
                    key={'dockerAdminButton'}
                    look='default'
                    shape='circle'
                    size='small'
                    icon='cog'
                    iconSize='xs'
                    tooltip={msg('apps.admin.tooltip')}
                    tooltipPlacement='left'
                    onClick={e => {
                        e.stopPropagation()
                        this.showAdmin(app)
                    }}
                />
            )
            : null
    }

    renderApp(app, hovered) {
        const {onSelect} = this.props
        return (
            <ListItem
                hovered={hovered}
                onClick={this.isAvailable(app) ? () => onSelect(app) : null}>
                <CrudItem
                    infoTooltip={msg('apps.info')}
                    tooltipPlacement='left'
                    inlineComponents={[
                        this.renderNoInstanceRequiredChip(app),
                        this.renderAppAdminButton(app),
                        this.renderGoogleAccountRequiredButton(app),
                        this.renderStatusIcon(app),
                    ]}
                    infoDisabled={false}
                    onInfo={() => this.showInfo(app)}>
                    <AppItem
                        app={app}
                        highlight={this.getHighlightMatcher()}
                    />
                </CrudItem>
            </ListItem>
        )
    }

    isDisabled(app) {
        return app.disabled
    }

    isDisallowed(app) {
        return app.googleAccountRequired && isServiceAccount()
    }

    isAvailable(app) {
        return !this.isDisabled(app) && !this.isDisallowed(app)
    }

    isDockerApp(app) {
        return app.endpoint && app.endpoint.includes('docker')
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
        const {apps} = this.props
        return _.chain(apps)
            .filter(({hidden}) => !hidden)
            .filter(app => this.appMatchesFilters(app))
            .map(app => ({...app, running: this.isRunning(app)}))
            .value()
    }

    isRunning(app) {
        const {tabs} = this.props
        return _.find(tabs, tab => tab.path === app.path)
    }

    appMatchesFilters(app) {
        return this.appMatchesFilterValues(app) && this.appMatchesTagFilter(app) && this.appMatchesGoogleAccountFilter(app)
    }

    appMatchesTagFilter(app) {
        const {tagFilter} = this.props
        return tagFilter === IGNORE || app.tags.includes(tagFilter)
    }

    appMatchesFilterValues(app) {
        const {filterValues} = this.props
        const searchMatchers = filterValues.map(filter => RegExp(filter, 'i'))
        const searchProperties = ['label', 'tagline']
        return filterValues
            ? _.every(searchMatchers, matcher =>
                _.find(searchProperties, property =>
                    matcher.test(simplifyString(app[property]))
                )
            )
            : true
    }

    appMatchesGoogleAccountFilter(app) {
        const {googleAccountFilter} = this.props
        return this.isDisallowed(app)
            ? googleAccountFilter
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

    toggleGoogleAccountFilter() {
        const {googleAccountFilter} = this.props
        actionBuilder('UPDATE_GOOGLE_ACCOUNT_FILTER', !googleAccountFilter)
            .set('apps.googleAccountFilter', !googleAccountFilter)
            .dispatch()
    }

    refreshProxies = () => {
        api.appLauncher.refreshProxies$().subscribe({
            next: () => {
                Notifications.success({
                    message: msg('apps.refreshProxies.success'),
                })
            },
            error: () => {
                Notifications.error({
                    message: msg('apps.refreshProxies.error'),
                })
            }
        })
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
    onSelect: PropTypes.func.isRequired
}
