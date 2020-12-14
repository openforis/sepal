import {AppDetails} from './appDetails'
import {AppItem} from './appItem'
import {Button} from 'widget/button'
import {Buttons} from 'widget/buttons'
import {CenteredProgress} from 'widget/progress'
import {Consumer} from './appListContext'
import {Layout} from 'widget/layout'
import {Pageable} from 'widget/pageable/pageable'
import {ScrollableContainer, Unscrollable} from 'widget/scrollable'
import {SearchBox} from 'widget/searchBox'
import {SuperButton} from 'widget/superButton'
import {compose} from 'compose'
import {connect} from 'store'
import {currentUser} from 'widget/user'
import {getLanguage} from 'translate'
import {msg} from 'translate'
import Icon from 'widget/icon'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './appListData.module.css'

const mapStateToProps = () => ({
    user: currentUser()
})

class _AppListData extends React.Component {
    state = {
        app: null
    }

    render() {
        return (
            <React.Fragment>
                <Consumer>
                    {({isLoading}) => {
                        return isLoading()
                            ? this.renderProgress()
                            : this.renderData()
                    }}
                </Consumer>
                {this.renderAppDetails()}
            </React.Fragment>
        )
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
        return (
            <Consumer>
                {({tags, hasData, highlightMatcher}) => {
                    const key = app => _.compact([app.path, highlightMatcher]).join('|')
                    return hasData()
                        ? (
                            <ScrollableContainer>
                                <Unscrollable>
                                    {this.renderSearchAndFilter(tags)}
                                </Unscrollable>
                                <Unscrollable className={styles.apps}>
                                    <Pageable.Data itemKey={app => key(app)}>
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
                        layout='horizontal-wrap'
                        spacing='tight'
                        options={options}
                        selected={tagFilter}
                        onChange={tagFilter => setTagFilter(tagFilter)}
                    />
                )}
            </Consumer>
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
                // pulse
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
            <SuperButton
                content={
                    <AppItem
                        app={app}
                        highlight={highlightMatcher}
                    />
                }
                disabled={unavailable}
                infoTooltip={msg('apps.info')}
                tooltipPlacement='left'
                inlineComponents={[
                    this.renderGoogleAccountRequiredButton(app),
                    this.renderStatusIcon(app)
                ]}
                infoDisabled={false}
                onInfo={() => this.showInfo(app)}
                onClick={() => onSelect(app)}
            />
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
}

export const AppListData = compose(
    _AppListData,
    connect(mapStateToProps)
)

AppListData.propTypes = {
    onSelect: PropTypes.func.isRequired
}
