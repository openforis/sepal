import {BehaviorSubject, distinctUntilChanged, filter, finalize, tap} from 'rxjs'
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
                const busyTab$ = new BehaviorSubject(false)

                addSubscription(
                    busyTab$.pipe(
                        finalize(
                            () => busy$.next({id, label, busy: false})
                        ),
                        distinctUntilChanged()
                    ).subscribe({
                        next: busy => busy$.next({id, label, busy})
                    }),
                    busy$.pipe(
                        filter((
                            // {id: currentId, label: currentLabel}) => currentId === id && currentLabel !== label
                            {id: currentId}) => currentId === id
                        ),
                        distinctUntilChanged()
                    ).subscribe({
                        next: ({busy}) => busyTab$.next(busy)
                    })
                )
        
                return busyTab$
            }
        },
        withTabContext(),
        withSubscriptions()
    )
