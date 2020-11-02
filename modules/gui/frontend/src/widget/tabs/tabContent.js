import {Enabled, connect} from 'store'
import {PortalContainer, PortalContext} from 'widget/portal'
import {compose} from 'compose'
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
                    <Enabled value={selected}>
                        <PortalContainer id={portalContainerId}/>
                        {children({id, type})}
                    </Enabled>
                </div>
            </PortalContext>
        )
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
