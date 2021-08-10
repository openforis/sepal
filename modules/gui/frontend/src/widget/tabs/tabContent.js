import {Enabled, connect} from 'store'
import {PortalContainer, PortalContext} from 'widget/portal'
import {TabContext} from './tabContext'
import {compose} from 'compose'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './tabContent.module.css'

class _TabContent extends React.PureComponent {
    render() {
        const {id, type, selected, busy$, children} = this.props
        const portalContainerId = `portal_tab_${id}`
        const tabContext = {
            setBusy: (label, isBusy) => busy$.next({id, label, isBusy})
        }
        return (
            <PortalContext id={portalContainerId}>
                <div className={[
                    styles.tabContent,
                    selected && styles.selected
                ].join(' ')}>
                    <Enabled value={selected}>
                        <PortalContainer id={portalContainerId}/>
                        <TabContext.Provider value={tabContext}>
                            {children({id, type})}
                        </TabContext.Provider>
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
    busy$: PropTypes.any,
    children: PropTypes.any,
    id: PropTypes.string,
    selected: PropTypes.any,
    type: PropTypes.string,
    onDisable: PropTypes.func,
    onEnable: PropTypes.func
}
