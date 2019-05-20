import {Button} from 'widget/button'
import {Content, SectionLayout, TopBar} from 'widget/sectionLayout'
import {Scrollable, ScrollableContainer} from 'widget/scrollable'
import {connect, select} from 'store'
import {isMobile} from 'widget/userAgent'
import {msg} from 'translate'
import Keybinding from 'widget/keybinding'
import PropTypes from 'prop-types'
import React from 'react'
import TabContent from './tabContent'
import Tooltip from 'widget/tooltip'
import actionBuilder from 'action-builder'
import guid from 'guid'
import styles from './tabs.module.css'

export const addTab = statePath => {
    const id = guid()
    const tab = {id, placeholder: msg('widget.tabs.newTab')}
    actionBuilder('ADD_TAB')
        .push([statePath, 'tabs'], tab)
        .set([statePath, 'selectedTabId'], id)
        .dispatch()
    return tab
}

const getTabIndex = (id, statePath) =>
    select([statePath, 'tabs'])
        .findIndex(tab => tab.id === id)

const toTabPath = (id, statePath) =>
    [statePath, 'tabs', getTabIndex(id, statePath)].join('.')

const renameTab = (id, title, tabPath, onTitleChanged) => {
    actionBuilder('RENAME_TAB')
        .set([tabPath, 'title'], title)
        .dispatch()
    setTimeout(() => onTitleChanged && onTitleChanged(select(tabPath)), 0)
}

export const closeTab = (id, statePath) => {
    const nextSelectedTabId = () => {
        const tabs = select([statePath, 'tabs'])
        const tabIndex = tabs.findIndex(tab => tab.id === id)
        const first = tabIndex === 0
        const last = tabIndex === tabs.length - 1

        if (!last)
            return tabs[tabIndex + 1].id
        else if (!first)
            return tabs[tabIndex - 1].id
        else
            return null
    }

    actionBuilder('CLOSE_TAB')
        .set([statePath, 'selectedTabId'], nextSelectedTabId())
        .del([statePath, 'tabs', {id}])
        .dispatch()
}

export const selectTab = (id, statePath) => {
    actionBuilder('SELECT_TAB')
        .set([statePath, 'selectedTabId'], id)
        .dispatch()
}

const mapStateToProps = (state, ownProps) => ({
    tabs: select([ownProps.statePath, 'tabs']) || [],
    selectedTabId: select([ownProps.statePath, 'selectedTabId'])
})

class Tabs extends React.Component {
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
            <Tab
                key={tab.id}
                id={tab.id}
                title={tab.title}
                placeholder={tab.placeholder}
                selected={tab.id === selectedTabId}
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

    componentDidUpdate() {
        const {tabs, statePath} = this.props
        if (tabs.length === 0)
            addTab(statePath)
    }
}

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

export default connect(mapStateToProps)(Tabs)

class Tab extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            editing: false,
            title: null
        }
        this.titleInput = React.createRef()
    }

    onTitleChange(e) {
        const value = e.target.value.replace(/[^\w-.]/g, '_')
        e.target.value = value
        this.setState({title: value})
    }

    saveTitle() {
        const {id, statePath, onTitleChanged} = this.props
        const tabPath = toTabPath(id, statePath)
        const selectTab = () => select(tabPath)
        const prevTitle = selectTab().title
        const title = this.titleInput.current.value
        if (prevTitle === title || (!prevTitle && !title))
            return
        renameTab(id, title, tabPath, onTitleChanged)
        this.setState(
            state => ({...state, editing: false})
        )
    }

    renderCloseButton() {
        const {onClose} = this.props
        return (
            <Button
                chromeless
                look='cancel'
                size='small'
                shape='circle'
                icon='times'
                message='message'
                onClick={() => onClose()}
            />
        )
    }

    render() {
        // [TODO] fix let
        let {id, title, placeholder, selected, statePath} = this.props
        title = this.state.title || title
        return (
            <Tooltip
                msg={title || placeholder}
                placement='bottom'
                delay={1}>
                <div
                    className={[styles.tab, styles.regular, selected && styles.selected].join(' ')}
                    onClick={() => selectTab(id, statePath)}>
                    <span className={[
                        styles.title,
                        title ? null : styles.placeholder,
                        selected ? styles.selected : null
                    ].join(' ')}>
                        <span>{title || placeholder}</span>
                        {selected
                            ? (
                                <input
                                    ref={this.titleInput}
                                    className={styles.title}
                                    defaultValue={title}
                                    placeholder={placeholder}
                                    autoFocus={!title && !isMobile()}
                                    spellCheck={false}
                                    autoComplete='off'
                                    onKeyDown={e => {
                                        if (['Enter', 'Escape'].includes(e.key)) {
                                            e.target.blur()
                                        }
                                    }}
                                    onChange={e => this.onTitleChange(e)}
                                    onBlur={() => this.saveTitle()}/>
                            ) : null
                        }
                    </span>
                    <span className={styles.close}>
                        {this.renderCloseButton()}
                    </span>
                </div>
            </Tooltip>
        )
    }

    scrollSelectedTabIntoView() {
        const element = this.titleInput.current
        element && element.scrollIntoView({inline: 'nearest'})
    }

    componentDidMount() {
        this.scrollSelectedTabIntoView()
    }

    componentDidUpdate(prevProps, prevState) {
        const {selected} = this.props
        selected && prevProps.selected !== selected && this.scrollSelectedTabIntoView()
        if (!prevState.editing && this.state.editing)
            this.titleInput.current.select()
    }
}

Tab.propTypes = {
    id: PropTypes.string,
    placeholder: PropTypes.string,
    selected: PropTypes.any,
    statePath: PropTypes.string,
    title: PropTypes.string,
    onTitleChanged: PropTypes.func
}
