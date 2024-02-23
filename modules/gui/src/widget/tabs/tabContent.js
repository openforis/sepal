import {Enabled} from 'enabled'
import {PortalContainer, PortalContext} from 'widget/portal'
import {TabContext} from './tabContext'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './tabContent.module.css'

export class TabContent extends React.PureComponent {
    render() {
        const {id, busyIn$, busyOut$, type, selected, children} = this.props
        const portalContainerId = `portal_tab_${id}`
        return (
            <div className={[
                styles.tabContent,
                selected && styles.selected
            ].join(' ')}>
                <Enabled enabled={selected}>
                    <PortalContainer id={portalContainerId}/>
                    <TabContext id={id} busyIn$={busyIn$} busyOut$={busyOut$}>
                        <PortalContext id={portalContainerId}>
                            {children({id, type})}
                        </PortalContext>
                    </TabContext>
                </Enabled>
            </div>
        )
    }
}

TabContent.propTypes = {
    busyIn$: PropTypes.any,
    busyOut$: PropTypes.any,
    children: PropTypes.any,
    id: PropTypes.string,
    selected: PropTypes.any,
    type: PropTypes.string
}
