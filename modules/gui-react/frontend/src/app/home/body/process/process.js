import actionBuilder from 'action-builder'
import flexy from 'flexy.module.css'
import guid from 'guid'
import React from 'react'
import {connect, Disabled, select} from 'store'
import {msg} from 'translate'
import Tooltip from 'widget/tooltip'
import CreateOrLoadRecipe from './createOrLoadRecipe'
import Mosaic from './mosaic/mosaic'
import styles from './process.module.css'

const addTab = () => {
    const id = guid()
    actionBuilder('ADD_TAB')
        .push('process.tabs', {id, placeholder: msg('process.newTab')})
        .set('process.selectedTabId', id)
        .dispatch()
}

const renameTab = (id, title) => {
    const tabIndex = select('process.tabs')
        .findIndex((tab) => tab.id === id)
    actionBuilder('RENAME_TAB')
        .set(['process.tabs', tabIndex, 'title'].join('.'), title)
        .dispatch()
}

const closeTab = (id) => {
    const updateSelectedTab = (process, stateBuilder) => {
        if (process.selectedTabId !== id)
            return
        const tabs = process.tabs
        const tabIndex = tabs.findIndex((tab) => tab.id === id)
        const last = tabIndex === tabs.length - 1
        const first = tabIndex === 0
        let nextSelectedId = null
        if (!last)
            nextSelectedId = tabs[tabIndex + 1].id
        else if (!first)
            nextSelectedId = tabs[tabIndex - 1].id
        return stateBuilder.set('process.selectedTabId', nextSelectedId)
    }

    actionBuilder('CLOSE_TAB')
        .withState('process', updateSelectedTab)
        .delValueByKey('process.tabs', 'id', id)
        .dispatch()
}

const selectTab = (id) => {
    actionBuilder('SELECT_TAB')
        .set('process.selectedTabId', id)
        .dispatch()
}

const mapStateToProps = () => ({
    tabs: select('process.tabs') || [],
    selectedTabId: select('process.selectedTabId'),
})

class Process extends React.Component {
    constructor(props) {
        super(props)
        if (props.tabs.length === 0)
            addTab()
    }

    componentWillReceiveProps(nextProps) {
        if (nextProps.tabs.length === 0)
            addTab()
    }

    render() {
        const selectedTabId = this.props.selectedTabId
        return (
            <div className={[styles.container, flexy.container].join(' ')}>
                <div className={styles.tabBar}>
                    {this.props.tabs.map((tab) =>
                        <Tab
                            key={tab.id}
                            id={tab.id}
                            title={tab.title}
                            placeholder={tab.placeholder}
                            selected={tab.id === selectedTabId}
                        />
                    )}
                    <NewTab onAdd={addTab}/>
                </div>

                <div className={[styles.tabContents, flexy.container].join(' ')}>
                    {this.props.tabs.map((tab) =>
                        <TabContent key={tab.id} tab={tab} selected={tab.id === selectedTabId}/>
                    )}
                </div>
            </div>
        )
    }
}

export default connect(mapStateToProps)(Process)


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
        const maxLength = 60
        const charCode = e.which || e.keyCode
        const enter = 13
        if (charCode === enter)
            return this.saveTitle()
        const char = String.fromCharCode(charCode)
        if ([' ', '-'].includes(char))
            e.target.value += '_'
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
        renameTab(this.props.id, this.titleInput.current.value)
        this.setState((state) => ({...state, editing: false}))
    }

    render() {
        let {id, title, placeholder, selected} = this.props
        title = this.state.title || title
        return (
            <Tooltip rawMsg={title || placeholder} bottom delay={1}>
                <div
                    className={[styles.tab, selected && styles.selected].join(' ')}
                    onClick={() => selectTab(id)}>
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
                            closeTab(id)
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

const TabContent = ({tab: {id, type}, selected}) => {
    const contents = () => {
        switch (type) {
            case 'mosaic':
                return <Mosaic id={id}/>
            case 'classification':
                return <Classification id={id}/>
            default:
                return <CreateOrLoadRecipe id={id}/>
        }
    }
    return (
        <div className={[styles.tabContent, selected && flexy.container, selected && styles.selected].join(' ')}>
            <Disabled.Consumer>{disabled =>
                <Disabled.Provider value={!disabled && !selected}>
                    {contents()}
                </Disabled.Provider>}
            </Disabled.Consumer>
        </div>
    )
}

const NewTab = ({onAdd}) =>
    <div className={styles.newTab} onClick={onAdd}>
        +
    </div>

const Classification = () =>
    <div>
        <h2>Classification</h2>
        <input placeholder='Some input'/>
    </div>