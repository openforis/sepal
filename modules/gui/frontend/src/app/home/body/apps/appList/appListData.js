import {AppDetails} from './appDetails'
import {CenteredProgress} from 'widget/progress'
import {Consumer} from './appListContext'
import {Layout} from 'widget/layout'
import {Pageable} from 'widget/pageable/pageable'
import {Panel} from 'widget/panel/panel'
import {ScrollableContainer, Unscrollable} from 'widget/scrollable'
import {SearchBox} from 'widget/searchBox'
import {SuperButton} from 'widget/superButton'
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
                {({hasData, highlightMatcher}) => {
                    return hasData()
                        ? (
                            <ScrollableContainer>
                                <Unscrollable>
                                    {this.renderSearchAndFilter()}
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

    renderSearchAndFilter() {
        return (
            <div className={styles.header}>
                <Layout type='horizontal' spacing='compact'>
                    {this.renderSearch()}
                    {/* {this.renderTagFilter()} */}
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

    // renderTagFilter() {
    //     const {tagFilter} = this.state
    //     const options = [{
    //         label: msg('apps.filter.tag.ignore.label'),
    //         value: null
    //     }, {
    //         label: msg('apps.filter.tag.tools.label'),
    //         value: 'TOOLS'
    //     }, {
    //         label: msg('apps.filter.tag.pinned.label'),
    //         value: 'PINNED'
    //     }]
    //     return (
    //         <Buttons
    //             chromeless
    //             layout='horizontal-nowrap'
    //             spacing='tight'
    //             options={options}
    //             selected={tagFilter}
    //             onChange={tagFilter => this.setTagFilter(tagFilter)}
    //         />
    //     )
    // }

    renderLogo(logoUrl) {
        return logoUrl
            ? <img
                src={logoUrl}
                className={styles.logo}
                style={{
                    backgroundColor: 'white'
                }}
            />
            : null
    }

    renderApp(app, highlightMatcher) {
        const {onSelect} = this.props
        const imageUrl = app.logoRef
            ? `/api/apps/image/${app.logoRef}`
            : null
        return (
            <SuperButton
                title={app.label}
                description={app.tagline}
                highlight={highlightMatcher}
                infoTooltip={msg('apps.info')}
                tooltipPlacement='left'
                // inlineComponents={[
                //     // <div className="itemType">RUNNING</div>
                // ]}
                infoDisabled={false}
                onInfo={() => this.showInfo(app)} // [TODO] implement it
                onClick={() => onSelect(app)}
                image={this.renderLogo(imageUrl)}
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
