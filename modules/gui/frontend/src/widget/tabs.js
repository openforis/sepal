import {Button} from 'widget/button'
import {Content, SectionLayout, TopBar} from 'widget/sectionLayout'
import {FormComponent, Input} from 'widget/formComponents'
import {Scrollable, ScrollableContainer, withScrollable} from 'widget/scrollable'
import {compose} from 'compose'
import {connect, select} from 'store'
import {msg} from 'translate'
import Keybinding from 'widget/keybinding'
import PropTypes from 'prop-types'
import React from 'react'
import TabContent from './tabContent'
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

const renameTab = (title, tabPath, onTitleChanged) => {
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

export default compose(
    Tabs,
    connect(mapStateToProps)
)

class _Tab extends React.Component {
    constructor(props) {
        super(props)
        const {title = ''} = props
        this.state = {
            editing: false,
            title: title,
            prevTitle: title
        }
    }

    titleInput = React.createRef()

    static getDerivedStateFromProps(props, state) {
        const {editing} = state
        const title = editing
            ? state.title || ''
            : props.title || ''
        return {
            title
        }
    }

    render() {
        const {placeholder, selected} = this.props
        const {title, editing} = this.state
        return (
            <FormComponent
                className={[
                    styles.tab,
                    styles.regular,
                    selected ? styles.selected : null,
                    editing ? styles.editing : null
                ].join(' ')}
                layout='horizontal-nowrap'
                spacing='none'
                tooltip={title || placeholder}
                tooltipPlacement='bottom'
            >
                {this.renderInput()}
                {this.renderCloseButton()}
            </FormComponent>
        )
    }

    renderInput() {
        const {placeholder, selected} = this.props
        const {title, editing} = this.state
        const keymap = {
            Enter: () => this.exitEditing(true),
            Escape: () => this.exitEditing(false),
        }
        return (
            <Keybinding keymap={keymap} disabled={!editing}>
                <Input
                    ref={this.titleInput}
                    className={styles.title}
                    value={title}
                    placeholder={placeholder}
                    autoFocus={!title}
                    border={false}
                    readOnly={!editing}
                    onClick={() => selected
                        ? this.editTitle()
                        : this.selectTab()
                    }
                    onChange={e => this.onTitleChange(e)}
                    onBlur={() => this.exitEditing(true)}/>
            </Keybinding>
        )
    }

    renderCloseButton() {
        const {onClose} = this.props
        return (
            <Button
                chromeless
                look='cancel'
                size='small'
                shape='none'
                icon='times'
                message='message'
                onClick={() => onClose()}
            />
        )
    }

    selectTab() {
        const {id, statePath} = this.props
        selectTab(id, statePath)
    }

    editTitle() {
        this.setState({editing: true}, () => this.focus())
    }

    onTitleChange(e) {
        const value = e.target.value.replace(/[^\w-.]/g, '_')
        // e.target.value = value
        this.setState({title: value})
    }

    exitEditing(save) {
        const {editing} = this.state
        if (editing) {
            if (save) {
                this.saveTitle()
            } else {
                this.restoreTitle()
            }
        }
    }

    saveTitle() {
        const {id, statePath, onTitleChanged} = this.props
        const {title} = this.state
        const tabPath = toTabPath(id, statePath)
        const selectTab = () => select(tabPath)
        const prevTitle = selectTab().title
        if (prevTitle !== title) {
            renameTab(title, tabPath, onTitleChanged)
        }
        this.setState({
            prevTitle: title,
            editing: false
        }, this.blur)
    }

    restoreTitle() {
        const {prevTitle} = this.state
        this.setState({
            title: prevTitle,
            editing: false
        }, this.blur)
    }

    focus() {
        this.titleInput.current.focus()
    }

    blur() {
        this.titleInput.current.blur()
    }

    scrollSelectedTabIntoView() {
        const {scrollable} = this.props
        const inputElement = this.titleInput.current
        const scrollableElement = scrollable && scrollable.getElement()
        if (!inputElement || !scrollableElement)
            return
        const tabElement = inputElement.closest(`.${styles.tab}`)
        const tabLeft = tabElement.offsetLeft
        const tabWidth = tabElement.clientWidth
        const tabRight = tabLeft + tabWidth
        const scrollableWidth = scrollableElement.clientWidth
        const min = Math.max(tabRight + tabWidth / 2 - scrollableWidth, 0)
        const max = Math.max(tabLeft - tabWidth / 2, 0)
        const offset = scrollable.getOffset('x')
        if (offset < min) {
            scrollable.scrollTo(min, 'x')
        } else if (offset > max) {
            scrollable.scrollTo(max, 'x')
        }
    }

    componentDidMount() {
        this.scrollSelectedTabIntoView()
    }

    componentDidUpdate(prevProps) {
        const {selected} = this.props
        if (selected && prevProps.selected !== selected) {
            this.scrollSelectedTabIntoView()
        }
    }
}

const Tab = compose(
    _Tab,
    withScrollable()
)

Tab.propTypes = {
    id: PropTypes.string,
    placeholder: PropTypes.string,
    selected: PropTypes.any,
    statePath: PropTypes.string,
    title: PropTypes.string,
    onTitleChanged: PropTypes.func
}
