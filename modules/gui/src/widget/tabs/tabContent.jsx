import PropTypes from 'prop-types'
import React from 'react'

import {Enabled} from '~/enabled'
import {PortalContainer, PortalContext} from '~/widget/portal'

import styles from './tabContent.module.css'
import {TabContext, TabDialogs} from './tabContext'

const NO_DIALOGS = []

// A tab not selected is inert as a whole: unseen, nothing in it takes focus. A tab's dialogs - modal panels its content
// scopes to it (panel.jsx) - render in a layer of their own above that content, which is inert while any is open:
// covered, its controls take no focus, pointer or keys. What lies outside the tab - its handle, the other tabs, the
// menu - stays as it was.
export class TabContent extends React.PureComponent {
    // derived once per mount — the tab id never changes for a keyed instance, and a stable
    // stream identity keeps the context value consistent across re-renders
    busyOut$ = this.props.tabBusy$(this.props.id)

    render() {
        const {id, busyIn$, type, selected, dialogs = NO_DIALOGS, children} = this.props
        const portalContainerId = `portal_tab_${id}`
        return (
            <div
                className={[
                    styles.tabContent,
                    selected && styles.selected
                ].join(' ')}
                inert={!selected}>
                <Enabled enabled={selected}>
                    <TabDialogs value={this.tabDialogs(dialogs)}>
                        <div className={styles.covered} inert={dialogs.length > 0}>
                            <PortalContainer id={portalContainerId}/>
                            <TabContext id={id} busyIn$={busyIn$} busyOut$={this.busyOut$}>
                                <PortalContext id={portalContainerId}>
                                    {children({id, type})}
                                </PortalContext>
                            </TabContext>
                        </div>
                        <PortalContainer id={this.dialogLayerId()} className={styles.dialogs}/>
                    </TabDialogs>
                </Enabled>
            </div>
        )
    }

    dialogLayerId() {
        return `dialogs_tab_${this.props.id}`
    }

    // One value per set of open dialogs, so that their consumers render again only when it changes.
    tabDialogs(open) {
        if (this.tabDialogsValue?.open !== open) {
            this.tabDialogsValue = {
                layerId: this.dialogLayerId(),
                open,
                setOpen: (dialogId, isOpen) => this.props.onDialog(this.props.id, dialogId, isOpen)
            }
        }
        return this.tabDialogsValue
    }
}

TabContent.propTypes = {
    busyIn$: PropTypes.any,
    children: PropTypes.any,
    dialogs: PropTypes.array,
    id: PropTypes.string,
    selected: PropTypes.any,
    tabBusy$: PropTypes.func,
    type: PropTypes.string,
    onDialog: PropTypes.func
}
