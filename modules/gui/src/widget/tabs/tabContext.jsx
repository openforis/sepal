import React from 'react'

import {compose} from '~/compose'
import {withContext} from '~/context'

const Context = React.createContext()

const withTabContext = withContext(Context, 'tab')

const DialogsContext = React.createContext()

// The tab's dialogs (tabContent.jsx): the layer they render in, those open, in the order they opened, and how one says
// it is open.
export const TabDialogs = DialogsContext.Provider

export const withTabDialogs = withContext(DialogsContext, 'tabDialogs')

export const TabContext = ({id, busyIn$, busyOut$, children}) =>
    <Context.Provider value={{id, busyIn$, busyOut$}}>
        {children}
    </Context.Provider>

export const withTab = () =>
    WrappedComponent => compose(
        class WithTabContextHOC extends React.Component {
            render() {
                return React.createElement(WrappedComponent, {
                    ...this.props,
                    tab: {
                        busy: this.busy(),
                        busy$: this.busy$()
                    }
                })
            }

            busy() {
                const {tab: {id: tabId, busyIn$}} = this.props
                return {
                    set: (busyId, busy) => busyIn$.next({tabId, busyId, busy})
                }
            }

            busy$() {
                const {tab: {busyOut$}} = this.props
                return busyOut$
            }
        },
        withTabContext()
    )
