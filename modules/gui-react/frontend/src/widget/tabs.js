import actionBuilder from 'action-builder'
import flexy from 'flexy.module.css'
import guid from 'guid'
import PropTypes from 'prop-types'
import React from 'react'
import {connect, select} from 'store'
import {msg} from 'translate'
import Tooltip from 'widget/tooltip'
import TabContent from './tabContent'
import styles from './tabs.module.css'

const addTab = (statePath) => {
    const id = guid()
    actionBuilder('ADD_TAB')
        .push(path(statePath, 'tabs'), {id, placeholder: msg('widget.tabs.newTab')})
        .set(path(statePath, 'selectedTabId'), id)
        .dispatch()
}

const renameTab = (id, title, statePath) => {
    const tabIndex = select(path(statePath, 'tabs'))
        .findIndex((tab) => tab.id === id)
    actionBuilder('RENAME_TAB')
        .set(path(statePath, 'tabs', tabIndex, 'title'), title)
        .dispatch()
}

const closeTab = (id, statePath) => {
    const updateSelectedTab = (root, stateBuilder) => {
        if (root.selectedTabId !== id)
            return
        const tabs = root.tabs
        const tabIndex = tabs.findIndex((tab) => tab.id === id)
        const last = tabIndex === tabs.length - 1
        const first = tabIndex === 0
        let nextSelectedId = null
        if (!last)
            nextSelectedId = tabs[tabIndex + 1].id
        else if (!first)
            nextSelectedId = tabs[tabIndex - 1].id
        return stateBuilder.set(path(statePath, 'selectedTabId'), nextSelectedId)
    }

    actionBuilder('CLOSE_TAB')
        .withState(statePath, updateSelectedTab)
        .delValueByKey(path(statePath, 'tabs'), 'id', id)
        .dispatch()
}

const selectTab = (id, statePath) => {
    actionBuilder('SELECT_TAB')
        .set(path(statePath, 'selectedTabId'), id)
        .dispatch()
}

const mapStateToProps = (state, ownProps) => ({
    tabs: select(path(ownProps.statePath, 'tabs')) || [],
    selectedTabId: select(path(ownProps.statePath, 'selectedTabId'))
})

const path = (...paths) => {
    return paths.join('.')
}

class Tabs extends React.Component {
    constructor(props) {
        super(props)
        const {tabs, statePath} = props
        if (tabs.length === 0)
            addTab(statePath)
    }

    componentWillReceiveProps(nextProps) {
        const {tabs, statePath} = nextProps
        if (tabs.length === 0)
            addTab(statePath)
    }

    render() {
        const {selectedTabId, statePath, tabActions, children} = this.props
        return (
            <div className={[styles.container, flexy.container].join(' ')}>
                <div className={styles.tabBar}>
                    <div className={styles.tabs}>
                        {this.props.tabs.map((tab) =>
                            <Tab
                                key={tab.id}
                                id={tab.id}
                                title={tab.title}
                                placeholder={tab.placeholder}
                                selected={tab.id === selectedTabId}
                                statePath={statePath}
                            />
                        )}
                        <NewTab onAdd={() => addTab(statePath)}/>
                    </div>
                    <div className={styles.tabActions}>{tabActions(selectedTabId)}</div>
                </div>

                <div className={[styles.tabContents, flexy.container].join(' ')}>
                    {this.props.tabs.map((tab) =>
                        <TabContent key={tab.id} tab={tab} selected={tab.id === selectedTabId}>
                            {children}
                        </TabContent>
                    )}
                </div>
            </div>
        )
    }
}

Tabs.propTypes = {
    statePath: PropTypes.string.isRequired,
    tabActions: PropTypes.func
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

    onTitleKeyPress(e) {
        const insertCharAtSelection = (input, char) => {
            const selectionStart = input.selectionStart
            input.value = input.value.slice(0, selectionStart).concat(char).concat(input.value.slice(input.selectionEnd))
            e.target.selectionStart = selectionStart + 1
            e.target.selectionEnd = selectionStart + 1
        }
        const maxLength = 60
        const charCode = e.which || e.keyCode
        const enter = 13
        if (charCode === enter)
            return this.saveTitle()
        const char = String.fromCharCode(charCode)
        if ([' ', '-'].includes(char))
            insertCharAtSelection(e.target, '_')
        if (!char.match(/[\w-.]/) || e.target.value.length > maxLength) {
            e.preventDefault()
            return false
        }
    }

    onTitleChange(e) {
        const value = e.target.value.replace(/[^\w-.]/g, '_')
        e.target.value = value
        this.setState((prevState) => ({...prevState, title: value}))
    }

    saveTitle() {
        const {id, statePath} = this.props
        renameTab(id, this.titleInput.current.value, statePath)
        this.setState((state) => ({...state, editing: false}))
    }

    render() {
        let {id, title, placeholder, selected, statePath} = this.props
        title = this.state.title || title
        return (
            <Tooltip rawMsg={title || placeholder} bottom delay={1}>
                <div
                    className={[styles.tab, selected && styles.selected].join(' ')}
                    onClick={() => selectTab(id, statePath)}>
                    <span className={[
                        styles.title,
                        title ? null : styles.placeholder,
                        selected ? styles.selected : null
                    ].join(' ')}>
                        <span>{title || placeholder}</span>
                        {selected
                            ? <input
                                ref={this.titleInput}
                                className={styles.title}
                                defaultValue={title}
                                placeholder={placeholder}
                                autoFocus={!title}
                                onKeyPress={this.onTitleKeyPress.bind(this)}
                                onChange={this.onTitleChange.bind(this)}
                                onBlur={this.saveTitle.bind(this)}/>
                            : null
                        }
                        </span>
                    <button
                        className={styles.close}
                        onClick={(e) => {
                            e.stopPropagation()
                            closeTab(id, statePath)
                        }}>
                        &times;
                    </button>
                </div>
            </Tooltip>
        )
    }

    componentDidUpdate(prevProps, prevState) {
        if (!prevState.editing && this.state.editing)
            this.titleInput.current.select()
    }
}

const NewTab = ({onAdd}) =>
    <div className={styles.newTab} onClick={onAdd}>
        +
    </div>