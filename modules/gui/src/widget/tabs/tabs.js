import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import {Content, SectionLayout, TopBar} from 'widget/sectionLayout'
import {Scrollable, ScrollableContainer} from 'widget/scrollable'
import {Subject, delay, filter} from 'rxjs'
import {TabContent} from './tabContent'
import {TabHandle} from './tabHandle'
import {compose} from 'compose'
import {connect, select} from 'store'
import {isMobile} from 'widget/userAgent'
import {msg} from 'translate'
import Keybinding from 'widget/keybinding'
import PropTypes from 'prop-types'
import React from 'react'
import actionBuilder from 'action-builder'
import guid from 'guid'
import styles from './tabs.module.css'
import withSubscriptions from 'subscription'

const CLOSE_ANIMATION_DURATION_MS = 250

const close$ = new Subject()

export const addTab = statePath => {
    const id = guid()
    const tab = {id, placeholder: msg('widget.tabs.newTab')}
    actionBuilder('ADD_TAB')
        .push([statePath, 'tabs'], tab)
        .set([statePath, 'selectedTabId'], id)
        .dispatch()
    return tab
}

export const closeTab = (id, statePath, nextId) => {
    close$.next({id, statePath, nextId})
    actionBuilder('CLOSING_TAB')
        .set([statePath, 'tabs', {id}, 'ui.closing'], true)
        .dispatch()
}

export const renameTab = (title, tabPath, onTitleChanged) => {
    actionBuilder('RENAME_TAB')
        .set([tabPath, 'title'], title)
        .dispatch()
    setTimeout(() => onTitleChanged && onTitleChanged(select(tabPath)), 0)
}

export const selectTab = (id, statePath) => {
    actionBuilder('SELECT_TAB')
        .set([statePath, 'selectedTabId'], id)
        .dispatch()
}

export const getTabsInfo = statePath => {
    const tabs = select([statePath, 'tabs'])
    const selectedId = select([statePath, 'selectedTabId'])
    if (tabs && selectedId) {
        const selectedIndex = tabs.findIndex(tab => tab.id === selectedId)
        const first = selectedIndex === 0
        const last = selectedIndex === tabs.length - 1
        const single = first && last
        const previousId = !first && tabs[selectedIndex - 1].id
        const nextId = !last && tabs[selectedIndex + 1].id
        return {
            tabs,
            selectedId,
            selectedIndex,
            first,
            last,
            single,
            previousId,
            nextId
        }
    }
    return {}
}

const mapStateToProps = (state, ownProps) => ({
    tabs: select([ownProps.statePath, 'tabs']) || [],
    selectedTabId: select([ownProps.statePath, 'selectedTabId'])
})

class _Tabs extends React.Component {
    constructor(props) {
        super(props)
        this.addTab = this.addTab.bind(this)
        this.closeSelectedTab = this.closeSelectedTab.bind(this)
        this.selectPreviousTab = this.selectPreviousTab.bind(this)
        this.selectNextTab = this.selectNextTab.bind(this)
        
        const {tabs, statePath} = props
        if (tabs.length === 0) {
            addTab(statePath)
        }
    }

    busy$ = new Subject()

    renderTab(tab) {
        const {selectedTabId, statePath, onTitleChanged, onClose} = this.props
        const close = () => this.closeTab(tab.id)
        return (
            <TabHandle
                key={tab.id}
                id={tab.id}
                title={tab.title}
                placeholder={tab.placeholder}
                selected={tab.id === selectedTabId}
                busy$={this.busy$}
                closing={tab.ui && tab.ui.closing}
                statePath={statePath}
                onTitleChanged={onTitleChanged}
                onClose={() => onClose ? onClose(tab, close) : close()}
            />
        )
    }

    renderTabContent(tab) {
        const {selectedTabId, children} = this.props
        return (
            <TabContent
                key={tab.id}
                id={tab.id}
                type={tab.type}
                selected={tab.id === selectedTabId}
                busy$={this.busy$}
            >
                {children}
            </TabContent>
        )
    }

    renderTabs() {
        const {tabs, maxTabs} = this.props
        return (
            <React.Fragment>
                <ScrollableContainer>
                    <Scrollable direction='x' className={styles.tabs}>
                        {maxTabs > 1 ? tabs.map(tab => this.renderTab(tab)) : null}
                    </Scrollable>
                </ScrollableContainer>
                {this.renderTabControls()}
            </React.Fragment>
        )
    }

    renderTabControls() {
        return (
            <div className={styles.tabActions}>
                {this.renderTabButtons()}
                {this.renderTabActions()}
            </div>
        )
    }

    renderTabActions() {
        const {selectedTabId, tabActions} = this.props
        return tabActions
            ? tabActions(selectedTabId)
            : null
    }

    renderTabButtons() {
        const {maxTabs} = this.props
        return maxTabs > 1 ? (
            <Keybinding keymap={{
                'Ctrl+Shift+W': this.closeSelectedTab,
                'Ctrl+Shift+T': this.addTab,
                'Ctrl+Shift+ArrowLeft': this.selectPreviousTab,
                'Ctrl+Shift+ArrowRight': this.selectNextTab
            }}>
                {isMobile() || this.renderNavigationButtons()}
                {this.renderAddButton()}
            </Keybinding>
        ) : null
    }

    selectPreviousTab() {
        const {statePath} = this.props
        const previousId = getTabsInfo(statePath).previousId
        if (previousId) {
            selectTab(previousId, statePath)
        }
    }

    selectNextTab() {
        const {statePath} = this.props
        const nextId = getTabsInfo(statePath).nextId
        if (nextId) {
            selectTab(nextId, statePath)
        }
    }

    isFirstTab() {
        const {statePath} = this.props
        return getTabsInfo(statePath).first
    }

    isLastTab() {
        const {statePath} = this.props
        return getTabsInfo(statePath).last
    }

    renderNavigationButtons() {
        return (
            <ButtonGroup layout='horizontal-nowrap'>
                <Button
                    chromeless
                    look='transparent'
                    size='large'
                    shape='circle'
                    icon='chevron-left'
                    onClick={this.selectPreviousTab}
                    disabled={this.isFirstTab()}/>
                <Button
                    chromeless
                    look='transparent'
                    size='large'
                    shape='circle'
                    icon='chevron-right'
                    onClick={this.selectNextTab}
                    disabled={this.isLastTab()}/>
            </ButtonGroup>
        )
    }

    isAddDisabled() {
        const {tabs, selectedTabId, isLandingTab, maxTabs} = this.props
        const selectedTab = tabs.find(tab => tab.id === selectedTabId)
        return tabs.length === maxTabs || selectedTab && isLandingTab && isLandingTab(selectedTab)
    }

    renderAddButton() {
        const {onAdd} = this.props
        return (
            <Button
                chromeless
                look='transparent'
                size='large'
                shape='circle'
                icon='plus'
                tooltip={msg('widget.tabs.addTab.tooltip')}
                tooltipPlacement='bottom'
                disabled={this.isAddDisabled() && !onAdd}
                onClick={this.addTab}/>
        )
    }

    addTab() {
        const {onAdd} = this.props
        const {statePath, tabs, isLandingTab} = this.props
        if (!this.isAddDisabled()) {
            if (isLandingTab) {
                const tab = tabs.find(tab => isLandingTab(tab))
                if (tab) {
                    return selectTab(tab.id, statePath)
                }
            }
            addTab(statePath)
        } else {
            onAdd && onAdd()
        }
    }

    closeTab(id) {
        const {statePath} = this.props
        closeTab(id, statePath)
    }

    closeSelectedTab() {
        const {selectedTabId} = this.props
        this.closeTab(selectedTabId)
    }

    render() {
        const {label} = this.props
        return (
            <SectionLayout className={styles.container}>
                <TopBar
                    padding={false}
                    label={label}>
                    {this.renderTabs()}
                </TopBar>
                <Content>
                    <div className={styles.tabContents}>
                        {this.props.tabs.map(tab => this.renderTabContent(tab))}
                    </div>
                </Content>
            </SectionLayout>
        )
    }

    componentDidMount() {
        this.handleCloseTab()
    }

    handleCloseTab() {
        const {addSubscription, statePath} = this.props
        addSubscription(
            close$.pipe(
                filter(tab => tab.statePath === statePath),
                delay(CLOSE_ANIMATION_DURATION_MS * 1.2),
            ).subscribe(
                ({id, statePath, nextId}) => this.finalizeCloseTab(id, statePath, nextId)
            )
        )
    }

    finalizeCloseTab(id, statePath, nextId) {
        const nextSelectedTabId = () => {
            const tabs = select([statePath, 'tabs'])
            const tabIndex = tabs.findIndex(tab => tab.id === id)
            const first = tabIndex === 0
            const last = tabIndex === tabs.length - 1
            if (!last) {
                return tabs[tabIndex + 1].id
            }
            if (!first) {
                return tabs[tabIndex - 1].id
            }
            return null
        }

        actionBuilder('CLOSE_TAB')
            .set([statePath, 'selectedTabId'], nextId || nextSelectedTabId())
            .del([statePath, 'tabs', {id}])
            .dispatch()
    }

    componentDidUpdate() {
        const {tabs, statePath} = this.props
        if (tabs.length === 0)
            addTab(statePath)
    }
}

export const Tabs = compose(
    _Tabs,
    connect(mapStateToProps),
    withSubscriptions()
)

Tabs.propTypes = {
    label: PropTypes.string.isRequired,
    statePath: PropTypes.string.isRequired,
    children: PropTypes.any,
    isDirty: PropTypes.func,
    isLandingTab: PropTypes.func,
    maxTabs: PropTypes.number,
    selectedTabId: PropTypes.string,
    tabActions: PropTypes.func,
    tabs: PropTypes.array,
    onAdd: PropTypes.func,
    onClose: PropTypes.func,
    onTitleChanged: PropTypes.func
}

Tabs.defaultProps = {
    maxTabs: 10
}
