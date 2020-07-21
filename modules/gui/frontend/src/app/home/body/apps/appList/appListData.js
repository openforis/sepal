import {AppDetails} from './appDetails'
import {AppItem} from './appItem'
import {Buttons} from 'widget/buttons'
import {CenteredProgress} from 'widget/progress'
import {Consumer} from './appListContext'
import {Layout} from 'widget/layout'
import {Pageable} from 'widget/pageable/pageable'
import {ScrollableContainer, Unscrollable} from 'widget/scrollable'
import {SearchBox} from 'widget/searchBox'
import {SuperButton} from 'widget/superButton'
import {getLanguage} from 'translate'
import {msg} from 'translate'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './appListData.module.css'

export class AppListData extends React.Component {
    state = {
        app: null
    }

    render() {
        const {app} = this.state
        return (
            <React.Fragment>
                <Consumer>
                    {({isLoading}) => {
                        return isLoading()
                            ? this.renderProgress()
                            : this.renderData()
                    }}
                </Consumer>
                {app ? this.renderDetails() : null}
            </React.Fragment>
        )
    }

    renderDetails() {
        const {app} = this.state
        const close = () => this.setState({app: null})
        return (
            <AppDetails app={app} onClose={close}/>
        )
    }

    renderProgress() {
        return <CenteredProgress title={msg('apps.loading.progress')}/>
    }

    renderData() {
        return (
            <Consumer>
                {({tags, hasData, highlightMatcher}) => {
                    return hasData()
                        ? (
                            <ScrollableContainer>
                                <Unscrollable>
                                    {this.renderSearchAndFilter(tags)}
                                </Unscrollable>
                                <Unscrollable className={styles.apps}>
                                    <Pageable.Data
                                        itemKey={app => `${app.label}|${highlightMatcher}`}>
                                        {app => this.renderApp(app, highlightMatcher)}
                                    </Pageable.Data>
                                </Unscrollable>
                            </ScrollableContainer>
                        )
                        : null
                }}
            </Consumer>
        )
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
        return (
            <Consumer>
                {({setFilter}) => (
                    <SearchBox
                        placeholder={msg('apps.filter.search.placeholder')}
                        onSearchValues={searchValues => setFilter(searchValues)}/>
                )}
            </Consumer>
        )
    }

    renderTagFilter(tags) {
        const {tagFilter} = this.state

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
            <Consumer>
                {({tagFilter, setTagFilter}) => (
                    <Buttons
                        chromeless
                        layout='horizontal-nowrap'
                        spacing='tight'
                        options={options}
                        selected={tagFilter}
                        onChange={tagFilter => setTagFilter(tagFilter)}
                    />
                )}
            </Consumer>
        )
    }

    renderApp(app, highlightMatcher) {
        const {onSelect} = this.props
        return (
            <SuperButton
                content={
                    <AppItem
                        app={app}
                        highlight={highlightMatcher}
                    />
                }
                infoTooltip={msg('apps.info')}
                tooltipPlacement='left'
                // inlineComponents={[
                //     // <div className="itemType">RUNNING</div>
                // ]}
                infoDisabled={false}
                onInfo={() => this.showInfo(app)} // [TODO] implement it
                onClick={() => onSelect(app)}
            />
        )
    }

    showInfo(app) {
        this.setState({app})
    }
}

AppListData.propTypes = {
    onSelect: PropTypes.func.isRequired
}
