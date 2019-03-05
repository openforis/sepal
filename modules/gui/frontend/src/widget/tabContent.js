import {Enabled, connect} from 'store'
import {sepalMap} from 'app/home/map/map'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './tabs.module.css'

class TabContent extends React.PureComponent {
    render() {
        const {id, type, selected, children} = this.props
        return (
            <div className={[styles.tabContent, selected && styles.selected].join(' ')}>
                <Enabled value={selected}>
                    {children({id, type})}
                </Enabled>
            </div>
        )
    }

    componentDidMount() {
        const {id} = this.props
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
        const {id, selected} = this.props
        const gotDeselected = prevProps.selected && !selected
        if (gotDeselected)
            sepalMap.clearContext(id)
        const gotSelected = !prevProps.selected && selected
        if (gotSelected)
            sepalMap.setContext(id)
    }

    componentWillUnmount() {
        const {id} = this.props
        sepalMap.removeContext(id)
    }
}

TabContent.propTypes = {
    children: PropTypes.any,
    id: PropTypes.string,
    type: PropTypes.string,
    selected: PropTypes.any,
    onDisable: PropTypes.func,
    onEnable: PropTypes.func
}

export default connect()(TabContent)
