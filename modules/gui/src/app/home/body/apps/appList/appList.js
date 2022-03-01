import {AppListData} from './appListData'
import {BottomBar, Content, SectionLayout} from 'widget/sectionLayout'
import {Pageable} from 'widget/pageable/pageable'
import {Provider} from './appListContext'
import {compose} from 'compose'
import {connect, select} from 'store'
import {loadApps$} from 'apps'
import {msg} from 'translate'
import {simplifyString, splitString} from 'string'
import Notifications from 'widget/notifications'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import actionBuilder from 'action-builder'
import styles from './appList.module.css'

const mapStateToProps = () => ({
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
        const {filterValues, tagFilter, tags, onSelect} = this.props
        return (
            <Provider value={{
                isLoading: this.isLoading.bind(this),
                hasData: this.hasData.bind(this),
                tags,
                setFilter: this.setFilter.bind(this),
                setTagFilter: this.setTagFilter.bind(this),
                tagFilter,
                highlightMatcher: filterValues.length
                    ? new RegExp(`(?:${filterValues.join('|')})`, 'i')
                    : null
            }}>
                <Pageable items={this.getApps()}>
                    <SectionLayout>
                        <Content horizontalPadding verticalPadding menuPadding className={styles.container}>
                            <AppListData onSelect={onSelect} searchValues={filterValues.join(' ')}/>
                        </Content>
                        <BottomBar className={styles.bottomBar}>
                            <Pageable.Controls/>
                        </BottomBar>
                    </SectionLayout>
                </Pageable>
            </Provider>
        )
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

    isLoading() {
        const {apps, stream} = this.props
        return !apps && stream('LOAD_APPS').active
    }

    isRunning(app) {
        const {tabs} = this.props
        return _.find(tabs, tab => tab.path === app.path)
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

    getApps() {
        const {apps} = this.props
        return _.chain(apps)
            .filter(app => this.appMatchesFilters(app))
            .map(app => ({...app, running: this.isRunning(app)}))
            .value()
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
}

export const AppList = compose(
    _AppList,
    connect(mapStateToProps)
)

AppList.propTypes = {
    onSelect: PropTypes.func.isRequired
}
