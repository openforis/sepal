import actionBuilder from 'action-builder'
import guid from 'guid'
import React from 'react'
import {connect, select} from 'store'
import {msg} from 'translate'
import Icon from 'widget/icon'
import CreateOrLoadRecipe from './createOrLoadRecipe'
import styles from './process.module.css'
import flexy from 'flexy.module.css'

const addTab = () => {
    const id = guid()
    actionBuilder('ADD_TAB')
        .push('process.tabs', {id, title: msg('process.newTab')})
        .set('process.selectedTabId', id)
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
                        <Tab key={tab.id} tab={tab} selected={tab.id === selectedTabId}/>
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

const Tab = ({tab: {id, type, title}, selected}) =>
    <div
        className={[styles.tab, selected && styles.selected].join(' ')}
        onClick={() => selectTab(id)}>
        <span className={styles.title}>{title}</span>
        <button
            className={styles.close}
            onClick={(e) => {
                e.stopPropagation()
                closeTab(id)
            }}>
            <Icon name='times'/>
        </button>
    </div>

const TabContent = ({tab: {type}, selected}) => {
    const contents = () => {
        switch (type) {
            case 'mosaic':
                return <Mosaic/>
            case 'classification':
                return <Classification/>
            default:
                return <CreateOrLoadRecipe/>
        }
    }
    return (
        <div className={[styles.tabContent, selected && flexy.container, selected && styles.selected].join(' ')}>
            {contents()}
        </div>
    )
}

const NewTab = ({onAdd}) =>
    <div className={styles.newTab} onClick={onAdd}>
        +
    </div>

const Mosaic = () =>
    <div>
        <h2>Mosaic</h2>
        <input placeholder='Some input'/>
    </div>

const Classification = () =>
    <div>
        <h2>Classification</h2>
        <input placeholder='Some input'/>
    </div>