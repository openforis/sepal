import {AppListData} from './appListData'
import {BottomBar, Content, SectionLayout} from 'widget/sectionLayout'
import {Pageable} from 'widget/pageable/pageable'
import {Provider} from './appListContext'
import {compose} from 'compose'
import {connect, select} from 'store'
import {loadApps$} from 'apps'
import {msg} from 'translate'
import Notifications from 'widget/notifications'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './appList.module.css'

const mapStateToProps = () => ({
    apps: select('apps.list'),
    tags: select('apps.tags'),
})

class _AppList extends React.Component {
    state = {
        app: null,
        filterValues: [],
        tagFilter: null
    }

    render() {
        const {tags, onSelect} = this.props
        const {filterValues} = this.state
        return (
            <Provider value={{
                isLoading: this.isLoading.bind(this),
                hasData: this.hasData.bind(this),
                tags,
                setFilter: this.setFilter.bind(this),
                highlightMatcher: filterValues.length
                    ? new RegExp(`(?:${filterValues.join('|')})`, 'i')
                    : null
            }}>
                <Pageable items={this.getApps()}>
                    <SectionLayout>
                        <Content horizontalPadding verticalPadding menuPadding className={styles.container}>
                            <AppListData onSelect={onSelect}/>
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
        const {apps, action} = this.props
        return !apps && !action('LOAD_APPS').dispatched
    }

    hasData() {
        const {apps} = this.props
        return apps && apps.length
    }

    setFilter(filterValues) {
        this.setState({
            filterValues
        })
    }

    getApps() {
        const {apps} = this.props
        return _.chain(apps)
            .filter(app => this.appMatchesFilter(app))
            .value()
    }
    
    appMatchesFilter(app) {
        const {filterValues} = this.state
        const searchMatchers = filterValues.map(filter => RegExp(filter, 'i'))
        const searchProperties = ['label', 'tagline']
        return filterValues
            ? _.every(searchMatchers, matcher =>
                _.find(searchProperties, property =>
                    matcher.test(app[property])
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
