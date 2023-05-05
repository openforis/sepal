import {AppDetails} from './appDetails'
import {AppItem} from './appItem'
import {Button} from 'widget/button'
import {Buttons} from 'widget/buttons'
import {CenteredProgress} from 'widget/progress'
import {Content, SectionLayout} from 'widget/sectionLayout'
import {CrudItem} from 'widget/crudItem'
import {FastList} from 'widget/fastList'
import {Layout} from 'widget/layout'
import {ListItem} from 'widget/listItem'
import {Scrollable, ScrollableContainer, Unscrollable} from 'widget/scrollable'
import {SearchBox} from 'widget/searchBox'
import {compose} from 'compose'
import {connect, select} from 'store'
import {currentUser} from 'user'
import {getLanguage, msg} from 'translate'
import {loadApps$} from 'apps'
import {simplifyString, splitString} from 'string'
import {userDetailsHint} from 'app/home/user/userDetails'
import Icon from 'widget/icon'
import Notifications from 'widget/notifications'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import actionBuilder from 'action-builder'
import memoizeOne from 'memoize-one'
import styles from './appList.module.css'

const IGNORE = 'IGNORE'

const mapStateToProps = () => ({
    user: currentUser(),
    apps: select('apps.list'),
    tags: select('apps.tags'),
    tabs: select('apps.tabs'),
    filterValue: select('apps.filterValue'),
    filterValues: select('apps.filterValues') || [],
    tagFilter: select('apps.tagFilter') || IGNORE,
    googleAccountFilter: select('apps.googleAccountFilter')
})

const getHighlightMatcher = memoizeOne(
    filterValues => filterValues.length
        ? new RegExp(`(?:${filterValues.join('|')})`, 'i')
        : ''
)

class _AppList extends React.Component {
    state = {
        app: null
    }

    constructor(props) {
        super(props)
        this.closeAppDetails = this.closeAppDetails.bind(this)
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

    renderAppDetails() {
        const {app} = this.state
        return app
            ? <AppDetails app={app} onClose={this.closeAppDetails}/>
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
                <ScrollableContainer>
                    <Unscrollable>
                        {this.renderHeader(apps)}
                    </Unscrollable>
                    <Scrollable direction='x'>
                        <FastList
                            items={apps}
                            itemKey={itemKey}
                            itemRenderer={this.renderApp}
                            spacing='tight'
                            overflow={50}
                            onEnter={this.handleSelect}
                        />
                    </Scrollable>
                </ScrollableContainer>
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
            <Layout className={styles.header} type='vertical' spacing='compact'>
                <Layout type='horizontal' spacing='compact'>
                    {this.renderSearch()}
                    {this.renderGoogleAccountFilter()}
                </Layout>
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

    renderGoogleAccountFilter() {
        const {googleAccountFilter} = this.props
        return this.isUsingServiceAccount() ? (
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
                        this.renderGoogleAccountRequiredButton(app),
                        this.renderStatusIcon(app)
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
        return app.googleAccountRequired && this.isUsingServiceAccount()
    }

    isAvailable(app) {
        return !this.isDisabled(app) && !this.isDisallowed(app)
    }

    isUsingServiceAccount() {
        const {user} = this.props
        return !user.googleTokens
    }

    showInfo(app) {
        this.setState({app})
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
