import {Subject, finalize} from 'rxjs'
import {compose} from 'compose'
import {v4 as uuid} from 'uuid'
import {withContext} from 'context'
import {withSubscriptions} from 'subscription'
import React from 'react'

const Context = React.createContext()

const withTabContext = withContext(Context, 'tab')

export const TabContext = ({id, busy$, children}) =>
    <Context.Provider value={{id, busy$}}>
        {children}
    </Context.Provider>

export const withTab = () =>
    WrappedComponent => compose(
        class WithTabContextHOC extends React.Component {
            constructor(props) {
                super(props)
                this.busy$ = this.createBusy$()
            }

            render() {
                const props = {
                    ...this.props,
                    tab: {busy$: this.busy$}
                }
                return React.createElement(WrappedComponent, props)
            }

            createBusy$() {
                const {tab: {id, busy$}, addSubscription} = this.props
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
        },
        withTabContext(),
        withSubscriptions()
    )
