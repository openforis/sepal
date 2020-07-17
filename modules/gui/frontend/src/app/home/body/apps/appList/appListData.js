import {CenteredProgress} from 'widget/progress'
import {Consumer} from './appListContext'
import {Layout} from 'widget/layout'
import {Pageable} from 'widget/pageable/pageable'
import {ScrollableContainer, Unscrollable} from 'widget/scrollable'
import {SearchBox} from 'widget/searchBox'
import {SuperButton} from 'widget/superButton'
import {msg} from 'translate'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './appListData.module.css'

export class AppListData extends React.Component {
    render() {
        return (
            <Consumer>
                {({isLoading}) => {
                    return isLoading()
                        ? this.renderProgress()
                        : this.renderData()
                }}
            </Consumer>
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

    renderAppImage({image, alt, style}, disabled) {
        return image
            ? <img
                src={image}
                alt={alt}
                className={disabled ? styles.disabled : null}
                height={100}
                style={style}/>
            : null
    }

    renderApp(app, highlightMatcher) {
        const {onSelect} = this.props
        return (
            <SuperButton
                title={app.label}
                description={app.description}
                highlight={highlightMatcher}
                infoTooltip={msg('apps.info')}
                tooltipPlacement='left'
                // inlineComponents={[
                //     // <div className="itemType">RUNNING</div>
                // ]}
                infoDisabled={true}
                onInfo={() => this.showInfo(app)} // [TODO] implement it
                onClick={() => onSelect(app)}
            />
        )
    }

    showInfo(app) {

    }
}

AppListData.propTypes = {
    onSelect: PropTypes.func.isRequired
}
