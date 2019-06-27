import {Enabled, connect} from 'store'
import {PortalContainer, PortalContext} from 'widget/portal'
import {compose} from 'compose'
import {sepalMap} from 'app/home/map/map'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './tabContent.module.css'

class _TabContent extends React.PureComponent {
    render() {
        const {id, type, selected, children} = this.props
        const portalContainerId = `portal_tab_${id}`
        return (
            <PortalContext id={portalContainerId}>
                <div className={[
                    styles.tabContent,
                    selected && styles.selected
                ].join(' ')}>
                    <Enabled
                        value={selected}
                        enabledClassName={styles.enabled}
                        disabledClassName={styles.disabled}>
                        <PortalContainer id={portalContainerId}/>
                        {children({id, type})}
                    </Enabled>
                </div>
            </PortalContext>
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

export const TabContent = compose(
    _TabContent,
    connect()
)

TabContent.propTypes = {
    children: PropTypes.any,
    id: PropTypes.string,
    selected: PropTypes.any,
    type: PropTypes.string,
    onDisable: PropTypes.func,
    onEnable: PropTypes.func
}
