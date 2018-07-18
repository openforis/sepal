import {sepalMap} from 'app/home/map/map'
import flexy from 'flexy.module.css'
import React from 'react'
import {connect, Enabled} from 'store'
import styles from './tabs.module.css'

class TabContent extends React.Component {
    render() {
        const {tab, selected, children} = this.props
        return (
            <div className={[styles.tabContent, selected && flexy.container, selected && styles.selected].join(' ')}>
                <Enabled value={selected}>
                    {children(tab)}
                </Enabled>
            </div>
        )
    }

    componentDidMount() {
        const {tab: {id}} = this.props
        this.props.onEnable(() => {
            if (this.props.selected)
                sepalMap.setContext(id)
        })
        this.props.onDisable(() => {
            sepalMap.clearContext(id)
        })
        sepalMap.setContext(id)
    }

    componentDidUpdate(prevProps) {
        const {tab: {id}, selected} = this.props
        const gotDeselected = prevProps.selected && !selected
        if (gotDeselected)
            sepalMap.clearContext(id)
        const gotSelected = !prevProps.selected && selected
        if (gotSelected)
            sepalMap.setContext(id)
    }

    componentWillUnmount() {
        const {tab: {id}} = this.props
        sepalMap.removeContext(id)
    }
}

export default connect()(TabContent)
