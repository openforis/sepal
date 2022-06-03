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
import {ScrollableContainer, Unscrollable} from 'widget/scrollable'
import {SearchBox} from 'widget/searchBox'
import {compose} from 'compose'
import {connect, select} from 'store'
import {currentUser} from 'user'
import {getLanguage, msg} from 'translate'
import {loadApps$} from 'apps'
import {simplifyString, splitString} from 'string'
import Icon from 'widget/icon'
import Notifications from 'widget/notifications'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import actionBuilder from 'action-builder'
import styles from './appList.module.css'

const mapStateToProps = () => ({
    user: currentUser(),
    apps: select('apps.list'),
    tags: select('apps.tags'),
    tabs: select('apps.tabs'),
    filterValues: select('apps.filterValues') || [],
    tagFilter: select('apps.tagFilter')
})

class _AppList extends React.Component {
    state = {
        app: null
    }

    render() {
        return (
            <SectionLayout>
                <Content horizontalPadding verticalPadding menuPadding className={styles.container}>
                    {this.isLoading()
                        ? this.renderProgress()
                        : this.renderData()}
                    {this.renderAppDetails()}
                </Content>
            </SectionLayout>
        )
    }

    getHighlightMatcher() {
        const {filterValues} = this.props
        return filterValues.length
            ? new RegExp(`(?:${filterValues.join('|')})`, 'i')
            : null
    }

    closeAppDetails() {
        this.setState({app: null})
    }

    renderAppDetails() {
        const {app} = this.state
        return app
            ? <AppDetails app={app} onClose={() => this.closeAppDetails()}/>
            : null
    }

    renderProgress() {
        return <CenteredProgress title={msg('apps.loading.progress')}/>
    }

    renderData() {
        const {tags} = this.props
        const highlightMatcher = this.getHighlightMatcher()
        const key = app => _.compact([app.path, highlightMatcher]).join('|')
        return this.hasData()
            ? (
                <ScrollableContainer>
                    <Unscrollable>
                        {this.renderSearchAndFilter(tags)}
                    </Unscrollable>
                    <Unscrollable className={styles.apps}>
                        <FastList
                            items={this.getApps()}
                            itemKey={app => key(app)}
                            spacing='tight'
                            overflow={50}>
                            {app => this.renderApp(app, highlightMatcher)}
                        </FastList>
                    </Unscrollable>
                </ScrollableContainer>
            )
            : null
    }

    renderSearchAndFilter(tags) {
        return (
            <div className={styles.header}>
                <Layout type='horizontal' spacing='compact'>
                    {this.renderSearch()}
                    {this.renderTagFilter(tags)}
                </Layout>
            </div>
        )
    }

    renderSearch() {
        const {searchValues} = this.props
        return (
            <SearchBox
                value={searchValues}
                placeholder={msg('apps.filter.search.placeholder')}
                onSearchValue={searchValue => this.setFilter(searchValue)}
            />
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
                value: null
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
                onChange={tagFilter => this.setTagFilter(tagFilter)}
            />
        )
    }

    renderGoogleAccountRequiredButton({googleAccountRequired}) {
        return googleAccountRequired
            ? (
                <Button
                    key={'renderGoogleAccountRequiredButton'}
                    chromeless
                    shape='circle'
                    icon='google'
                    iconType='brands'
                    iconStyle='warning'
                    tooltip={msg('apps.googleAccountRequired')}
                    tooltipPlacement='left'
                    onClick={() => null}
                />
            )
            : null
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

    renderApp(app, highlightMatcher) {
        const {onSelect} = this.props
        const unavailable = this.isDisabled(app) || this.isDisallowed(app)
        return (
            <ListItem
                disabled={unavailable}
                onClick={() => onSelect(app)}
            >
                <CrudItem
                    infoTooltip={msg('apps.info')}
                    tooltipPlacement='left'
                    inlineComponents={[
                        this.renderGoogleAccountRequiredButton(app),
                        this.renderStatusIcon(app)
                    ]}
                    infoDisabled={false}
                    onInfo={() => this.showInfo(app)}
                >
                    <AppItem
                        app={app}
                        highlight={highlightMatcher}
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
            .filter(app => this.appMatchesFilters(app))
            .map(app => ({...app, running: this.isRunning(app)}))
            .value()
    }

    isRunning(app) {
        const {tabs} = this.props
        return _.find(tabs, tab => tab.path === app.path)
    }

    appMatchesFilters(app) {
        return this.appMatchesFilterValues(app) && this.appMatchesTagFilter(app)
    }

    appMatchesTagFilter(app) {
        const {tagFilter} = this.props
        return !tagFilter || app.tags.includes(tagFilter)
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
        actionBuilder('UPDATE_FILTER_VALUES', filterValues)
            .set('apps.filterValues', filterValues)
            .dispatch()
    }

    setTagFilter(tagFilter) {
        actionBuilder('UPDATE_TAG_FILTER', tagFilter)
            .set('apps.tagFilter', tagFilter)
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
