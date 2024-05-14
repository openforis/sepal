import {Button} from '~/widget/button'
import {ButtonGroup} from '~/widget/buttonGroup'
import {Content, SectionLayout, TopBar} from '~/widget/sectionLayout'
import {EMPTY, Subject, groupBy, map, mergeMap, mergeScan, of, shareReplay} from 'rxjs'
import {Keybinding} from '~/widget/keybinding'
import {Scrollable} from '~/widget/scrollable'
import {TabContent} from './tabContent'
import {TabHandle} from './tabHandle'
import {addTab, closeTab, selectTab} from './tabActions'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {isMobile} from '~/widget/userAgent'
import {msg} from '~/translate'
import {select} from '~/store'
import {withSubscriptions} from '~/subscription'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './tabs.module.css'

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
        this.renderTabHandle = this.renderTabHandle.bind(this)
        this.addTab = this.addTab.bind(this)
        this.closeSelectedTab = this.closeSelectedTab.bind(this)
        this.selectPreviousTab = this.selectPreviousTab.bind(this)
        this.selectNextTab = this.selectNextTab.bind(this)
        
        const {tabs, statePath} = props
        if (tabs.length === 0) {
            addTab(statePath)
        }

        this.busyIn$ = new Subject()

        this.busyOut$ = this.busyIn$.pipe(
            groupBy(({busyId}) => busyId),
            mergeMap(group$ =>
                group$.pipe(
                    mergeScan(
                        ({busy: wasBusy}, {tabId, busyId, busy}) =>
                            busy === wasBusy ? EMPTY : of({tabId, busyId, busy}),
                        {busy: false}
                    )
                )
            ),
            groupBy(({tabId}) => tabId),
            mergeMap(group$ =>
                group$.pipe(
                    mergeScan(
                        ({count}, {tabId, busy}) =>
                            of({tabId, count: count + (busy ? 1 : -1)}),
                        {count: 0}
                    )
                )
            ),
            map(({tabId, count}) => ({tabId, count, busy: count > 0})),
            shareReplay({bufferSize: 1, refCount: true})
        )
    }

    renderTabHandle(tab) {
        const {selectedTabId, statePath, onTitleChanged} = this.props
        return (
            <TabHandle
                key={tab.id}
                id={tab.id}
                title={tab.title}
                placeholder={tab.placeholder}
                selected={tab.id === selectedTabId}
                busyOut$={this.busyOut$}
                closing={tab.ui && tab.ui.closing}
                statePath={statePath}
                onTitleChanged={onTitleChanged}
                onClose={() => this.onClose(tab)}
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
                busyIn$={this.busyIn$}
                busyOut$={this.busyOut$}
            >
                {children}
            </TabContent>
        )
    }

    renderTabs() {
        const {tabs, maxTabs} = this.props
        return (
            <React.Fragment>
                <Scrollable
                    direction='x'
                    className={styles.tabs}>
                    {maxTabs > 1 ? tabs.map(this.renderTabHandle) : null}
                </Scrollable>
                {this.renderTabControls()}
            </React.Fragment>
        )
    }

    onClose(tab) {
        const {onClose} = this.props
        onClose ? onClose(tab, () => this.closeTab(tab.id)) : this.closeTab(tab.id)
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
                <TopBar label={label}>
                    {this.renderTabs()}
                </TopBar>
                <Content className={styles.tabContents}>
                    {this.props.tabs.map(tab => this.renderTabContent(tab))}
                </Content>
            </SectionLayout>
        )
    }

    componentDidUpdate() {
        const {tabs, statePath} = this.props
        if (tabs.length === 0) {
            addTab(statePath)
        }
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
