import {Button} from 'widget/button'
import {Content, SectionLayout, TopBar} from 'widget/sectionLayout'
import {Scrollable, ScrollableContainer} from 'widget/scrollable'
import {Subject} from 'rxjs'
import {TabContent} from './tabContent'
import {TabHandle} from './tabHandle'
import {compose} from 'compose'
import {connect, select} from 'store'
import {delay} from 'rxjs/operators'
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

export const closeTab = (id, statePath) => {
    close$.next({id, statePath})
    actionBuilder('CLOSING_TAB')
        .set([statePath, 'tabs', {id}, 'closing'], true)
        .dispatch()
}

const mapStateToProps = (state, ownProps) => ({
    tabs: select([ownProps.statePath, 'tabs']) || [],
    selectedTabId: select([ownProps.statePath, 'selectedTabId'])
})

class _Tabs extends React.Component {
    constructor(props) {
        super(props)
        const {tabs, statePath} = props
        if (tabs.length === 0)
            addTab(statePath)
    }

    renderTab(tab) {
        const {selectedTabId, statePath, onTitleChanged, onClose} = this.props
        const close = () => closeTab(tab.id, statePath)
        return (
            <TabHandle
                key={tab.id}
                id={tab.id}
                title={tab.title}
                placeholder={tab.placeholder}
                selected={tab.id === selectedTabId}
                closing={tab.closing}
                statePath={statePath}
                onTitleChanged={onTitleChanged}
                onClose={() => {
                    onClose ? onClose(tab, close) : close()
                }}
            />
        )
    }

    renderTabContent(tab) {
        const {selectedTabId, children} = this.props
        return (
            <TabContent key={tab.id} id={tab.id} type={tab.type} selected={tab.id === selectedTabId}>
                {children}
            </TabContent>
        )
    }

    renderTabs() {
        const {tabs, selectedTabId, tabActions, statePath} = this.props
        return (
            <Keybinding keymap={{
                'Ctrl+Shift+W': () => closeTab(selectedTabId, statePath),
                'Ctrl+Shift+T': () => addTab(statePath),
            }}>
                <ScrollableContainer>
                    <Scrollable direction='x' className={styles.tabs}>
                        {tabs.map(tab => this.renderTab(tab))}
                    </Scrollable>
                </ScrollableContainer>
                <div className={styles.tabActions}>
                    {this.renderAddButton()}
                    {tabActions && tabActions(selectedTabId)}
                </div>
            </Keybinding>
        )
    }

    renderAddButton() {
        const {statePath} = this.props
        return (
            <Button
                chromeless
                size='large'
                shape='circle'
                icon='plus'
                tooltip={msg('widget.tabs.addTab.tooltip')}
                tooltipPlacement='bottom'
                onClick={() => addTab(statePath)}/>
        )
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
        const {addSubscription} = this.props
        addSubscription(
            close$.pipe(
                delay(CLOSE_ANIMATION_DURATION_MS * 1.2)
            ).subscribe(
                ({id, statePath}) => this.closeTab(id, statePath)
            )
        )
    }

    closeTab(id, statePath) {
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
            .set([statePath, 'selectedTabId'], nextSelectedTabId())
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
    selectedTabId: PropTypes.string,
    tabActions: PropTypes.func,
    tabs: PropTypes.array,
    onClose: PropTypes.func,
    onTitleChanged: PropTypes.func
}
