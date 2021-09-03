import {Enabled, connect} from 'store'
import {PortalContainer, PortalContext} from 'widget/portal'
import {Subject} from 'rxjs'
import {TabContext} from './tabContext'
import {compose} from 'compose'
import {finalize} from 'rxjs/operators'
import {v4 as uuid} from 'uuid'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './tabContent.module.css'
import withSubscriptions from 'subscription'

class _TabContent extends React.PureComponent {
    constructor() {
        super()
        this.getBusy$ = this.getBusy$.bind(this)
    }

    render() {
        const {id, type, selected, children} = this.props
        const portalContainerId = `portal_tab_${id}`
        const tabContext = {
            getBusy$: this.getBusy$
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

    getBusy$() {
        const {id, busy$, addSubscription} = this.props
        const label = uuid()
        const busyTab$ = new Subject()
        const setBusy = busy => busy$.next({id, label, busy})

        addSubscription(
            busyTab$.pipe(
                finalize(() => setBusy(false))
            ).subscribe({
                next: busy => setBusy(busy)
            })
        )

        return busyTab$
    }
}

export const TabContent = compose(
    _TabContent,
    connect(),
    withSubscriptions()
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
