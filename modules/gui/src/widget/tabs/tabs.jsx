import PropTypes from 'prop-types'
import React from 'react'
import {distinctUntilChanged, EMPTY, groupBy, map, mergeMap, mergeScan, of, scan, shareReplay, startWith, Subject} from 'rxjs'

import {asFunctionalComponent} from '~/classComponent'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {select} from '~/store'
import {withSubscriptions} from '~/subscription'
import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {ButtonGroup} from '~/widget/buttonGroup'
import {DraggableList} from '~/widget/draggableList'
import {Keybinding} from '~/widget/keybinding'
import {Scrollable} from '~/widget/scrollable'
import {Content, SectionLayout, TopBar} from '~/widget/sectionLayout'
import {isMobile} from '~/widget/userAgent'

import {ButtonSelect} from '../buttonSelect'
import {addTab, closeTab, reorderTabs, selectTab} from './tabActions'
import {TabContent} from './tabContent'
import {TabHandle} from './tabHandle'
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
    state = {
        dragging: false
    }

    constructor(props) {
        super(props)
        this.renderTabHandle = this.renderTabHandle.bind(this)
        this.onHandleDragStart = this.onHandleDragStart.bind(this)
        this.onHandleDragEnd = this.onHandleDragEnd.bind(this)
        this.addTab = this.addTab.bind(this)
        this.closeSelectedTab = this.closeSelectedTab.bind(this)
        this.selectPreviousTab = this.selectPreviousTab.bind(this)
        this.selectNextTab = this.selectNextTab.bind(this)
        this.tabBusy$ = this.tabBusy$.bind(this)
        
        this.busyIn$ = new Subject()

        // busyTabs$ emits the FULL busy state of all tabs ({[tabId]: {count, busy}}, idle tabs
        // pruned) on every update, so the shareReplay(1) buffer always carries every tab's
        // current state and a late subscriber starts from actual state — a per-tab-transition
        // stream would only buffer whichever tab changed last. Consumers never see it:
        // they derive their own pre-filtered per-tab stream once, through the tabBusy$ factory.
        this.busyTabs$ = this.busyIn$.pipe(
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
            scan((busyTabs, {tabId, busy}) => {
                const count = (busyTabs[tabId]?.count || 0) + (busy ? 1 : -1)
                const {[tabId]: _removed, ...remainingBusyTabs} = busyTabs
                return count > 0
                    ? {...remainingBusyTabs, [tabId]: {count, busy: true}}
                    : remainingBusyTabs
            }, {}),
            startWith({}),
            shareReplay({bufferSize: 1, refCount: true})
        )

        this.initialize()
    }

    // Per-tab {busy, count} stream factory. The factory itself is the stable prop (bound once);
    // each child derives its own stream once per mount, so no per-tabId cache is needed here.
    tabBusy$(tabId) {
        return this.busyTabs$.pipe(
            map(busyTabs => busyTabs[tabId] || {busy: false, count: 0}),
            distinctUntilChanged(({count: previousCount}, {count}) => previousCount === count)
        )
    }

    renderTabHandle(tab) {
        const {selectedTabId, statePath, tabPrefix, onTitleChanged} = this.props
        const {dragging} = this.state
        return (
            <TabHandle
                key={tab.id}
                dragging={dragging}
                id={tab.id}
                title={tab.title}
                placeholder={tab.placeholder}
                prefix={tabPrefix ? tabPrefix(tab) : undefined}
                selected={tab.id === selectedTabId}
                tabBusy$={this.tabBusy$}
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
                tabBusy$={this.tabBusy$}
            >
                {children}
            </TabContent>
        )
    }

    renderTabHandles() {
        const {tabs, maxTabs, statePath} = this.props
        return (
            <React.Fragment>
                <Scrollable
                    direction='x'
                    hideScrollbar={true}
                    className={styles.tabs}>
                    {maxTabs > 1 ? (
                        <DraggableList
                            axis='x'
                            items={tabs}
                            itemId={({id}) => id}
                            itemClassName={styles.tabHandleItem}
                            itemRenderer={tab => this.renderTabHandle(tab)}
                            onChange={reorderedTabs => reorderTabs(statePath, reorderedTabs.map(({id}) => id))}
                            onDragStart={this.onHandleDragStart}
                            onDragEnd={this.onHandleDragEnd}
                            onDragCancel={this.onHandleDragEnd}
                        />
                    ) : null}
                </Scrollable>
                {this.renderTabControls()}
            </React.Fragment>
        )
    }

    onClose(tab) {
        const {onClose} = this.props
        onClose ? onClose(tab, () => this.closeTab(tab.id)) : this.closeTab(tab.id)
    }

    onHandleDragStart() {
        clearTimeout(this.dragSettleTimeout)
        this.setState({dragging: true})
    }

    onHandleDragEnd() {
        // keep animations suppressed until the drop's DOM reorder has settled —
        // React re-inserts the moved nodes, which would restart their animations
        clearTimeout(this.dragSettleTimeout)
        this.dragSettleTimeout = setTimeout(() => this.setState({dragging: false}), 300)
    }

    componentWillUnmount() {
        clearTimeout(this.dragSettleTimeout)
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
        const {maxTabs, addTabOptions} = this.props
        return maxTabs > 1 ? (
            <Keybinding keymap={{
                'Ctrl+Shift+W': this.closeSelectedTab,
                'Ctrl+Shift+T': this.addTab,
                'Ctrl+Shift+ArrowLeft': this.selectPreviousTab,
                'Ctrl+Shift+ArrowRight': this.selectNextTab
            }}>
                {isMobile() || this.renderNavigationButtons()}
                {addTabOptions ? this.renderAddButtonSelect() : this.renderAddButton()}
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
                tooltipPlacement='left'
                disabled={this.isAddDisabled() && !onAdd}
                onClick={this.addTab}/>
        )
    }

    renderAddButtonSelect() {
        const {addTabOptions, onAdd} = this.props
        return (
            <ButtonSelect
                chromeless
                look='transparent'
                size='large'
                shape='circle'
                icon='plus'
                tooltip={msg('widget.tabs.addTab.tooltip')}
                tooltipPlacement='left'
                noChevron
                hPlacement='over-left'
                disabled={this.isAddDisabled() && !onAdd}
                options={addTabOptions}
                onSelect={this.addTab}
            />
        )
    }

    addTab(option) {
        const {onAdd} = this.props
        const {statePath, tabs, isLandingTab} = this.props
        if (!this.isAddDisabled()) {
            if (isLandingTab) {
                const tab = tabs.find(tab => isLandingTab(tab))
                if (tab) {
                    return selectTab(tab.id, statePath)
                }
            }
            addTab(statePath, option?.value, option.placeholder)
        } else {
            onAdd && onAdd()
        }
    }

    closeTab(id) {
        const {statePath} = this.props
        closeTab(id, statePath)
    }

    closeSelectedTab() {
        const {selectedTabId, tabs} = this.props
        const tab = tabs.find(({id}) => id === selectedTabId)
        // Route through onClose so section hooks (close confirmation, app release) also
        // apply to the keyboard shortcut, not just the tab-handle close button.
        tab && this.onClose(tab)
    }

    render() {
        const {label, tabs} = this.props
        return (
            <SectionLayout className={styles.container}>
                <TopBar label={label}>
                    {this.renderTabHandles()}
                </TopBar>
                <Content className={styles.tabContents}>
                    {/* contents are stacked panels toggled by `selected` — their sibling order is
                        invisible, so render them in an order that is STABLE across tab reorders:
                        moving a content's DOM node would reset it (a re-inserted iframe reloads) */}
                    {[...tabs]
                        .sort((a, b) => a.id.localeCompare(b.id))
                        .map(tab => this.renderTabContent(tab))}
                </Content>
            </SectionLayout>
        )
    }

    initialize() {
        const {tabs, addTabOptions, initializeTypes, statePath} = this.props
        if (initializeTypes) {
            initializeTypes.forEach(initializeType => {
                if (!tabs.find(({type}) => type === initializeType)) {
                    const placeholder = addTabOptions && addTabOptions.find(({value}) => value === initializeType)?.placeholder
                    addTab(statePath, initializeType, placeholder)
                }
            })
        } else {
            if (tabs.length === 0) {
                addTab(statePath)
            }
        }
    }

    componentDidUpdate() {
        this.initialize()
    }
}

export const Tabs = compose(
    _Tabs,
    connect(mapStateToProps),
    withSubscriptions(),
    asFunctionalComponent({
        maxTabs: 10
    })
)

Tabs.propTypes = {
    label: PropTypes.string.isRequired,
    statePath: PropTypes.string.isRequired,
    addTabOptions: PropTypes.arrayOf(
        PropTypes.shape({
            label: PropTypes.string,
            value: PropTypes.string
        })
    ),
    children: PropTypes.any,
    initializeTypes: PropTypes.array,
    isDirty: PropTypes.func,
    isLandingTab: PropTypes.func,
    maxTabs: PropTypes.number,
    selectedTabId: PropTypes.string,
    tabActions: PropTypes.func,
    tabPrefix: PropTypes.func,
    tabs: PropTypes.array,
    onAdd: PropTypes.func,
    onClose: PropTypes.func,
    onTitleChanged: PropTypes.func
}
