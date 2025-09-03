import React from 'react'
import {filter, map} from 'rxjs'

import {compose} from '~/compose'
import {withContext} from '~/context'

const Context = React.createContext()

const withTabContext = withContext(Context, 'tab')

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
                const {tab: {id: tabId, busyOut$}} = this.props
                return busyOut$.pipe(
                    filter(({tabId: currentTabId}) => currentTabId === tabId),
                    map(({busy, count}) => ({busy, count}))
                )
            }
        },
        withTabContext()
    )
