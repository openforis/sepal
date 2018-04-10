import actionBuilder from 'action-builder'
import guid from 'guid'
import React from 'react'
import {connect, select} from 'store'
import Icon from 'widget/icon'
import styles from './process.module.css'

const addTab = (title, type) => {
    const id = guid()
    actionBuilder('ADD_TAB')
        .push('process.tabs', {id, type, title})
        .set('process.selectedTabId', id)
        .dispatch()
}

const closeTab = (id) => {
    actionBuilder('CLOSE_TAB')
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
    addTab() {
        addTab('Some title ' + (this.props.tabs.length + 1), Math.random() < 0.5 ? 'mosaic' : 'classification')
    }

    render() {
        const selectedTabId = this.props.selectedTabId
        const tabs = this.props.tabs.map((tab) =>
            <Tab key={tab.id} tab={tab} selected={tab.id === selectedTabId}/>
        )
        const tabPanels = this.props.tabs.map((tab) =>
            <TabPanel key={tab.id} tab={tab} selected={tab.id === selectedTabId}/>
        )

        return (
            <div>
                <div className={styles.tabBar}>
                    {tabs}
                    <NewTab onAdd={this.addTab.bind(this)}/>
                </div>

                <div className={styles.content}>
                    {tabPanels}
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
        <button className={styles.close} onClick={() => closeTab(id)}>
            <Icon name='times'/>
        </button>
        <span className={styles.title}>{title}</span>
    </div>

const TabPanel = ({tab: {type}, selected}) => {
    const contents = () => {
        switch (type) {
            case 'mosaic':
                return <Mosaic/>
            case 'classification':
                return <Classification/>
            default:
                return null
        }
    }
    return (
        <div className={[styles.panel, selected && styles.selected].join(' ')}>
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