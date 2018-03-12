import React from 'react'
import {connect as connectToRedux} from 'react-redux'
import immutable from 'object-path-immutable'
import Rx from 'rxjs'

let storeInstance = null

export function initStore(store) {
    storeInstance = store
}

export function state() {
    return storeInstance.getState() || {}
}

export function dispatch(actionOrType, epic) {
    if (epic)
        storeInstance.dispatch({type: actionOrType, epic})
    else
        storeInstance.dispatch(actionOrType)
}

export function updateState(type, valueByPath) {
    return {
        type,
        reduce(state) {
            return ({...state, ...valueByPath})
        }
    }
}

export function createAction(reducer = (state) => state, type = 'Some default action') {
    return {
        type,
        reduce(state) {
            return reducer(immutable(state)).value()
        }
    }
}

export function connect(
    {
        props = {},
        actions = {},
        componentWillMount,
        componentWillUnmount
    }) {
    return (WrappedComponent) => {
        class ConnectedComponent extends React.Component {
            constructor(props) {
                super(props)
                componentWillMount = componentWillMount && componentWillMount.bind(this)
                this.componentWillUnmount$ = new Rx.Subject().take(1)
                actions = Object.keys(actions).map((name) => actions[name].bind(this))
            }

            action(action$, type) {
                // Create an id
                return {
                    onComplete(callback) {
                        return this
                    },

                    onError(callback) {
                        return this
                    },

                    cancelOnNext() {
                        return this
                    },

                    dispatch() {

                    }
                }
            }



            dispatch(type, action$, {dispatched, completed, failed} = {}) {
                if (dispatched)
                    dispatchBatch(type + ' [DISPATCHED]', dispatched())

                action$.take(1).subscribe(
                    (action) => {
                        const actions = [action]
                        if (completed)
                            actions.push(completed(action))
                        dispatchBatch(type + ' [COMPLETED]', actions)
                    },
                    (error) => {
                        // TODO: Implement...
                        // if (failed)
                        //     dispatchBatch(type + ' [FAILED]', actions)
                    }
                )
            }

            componentWillMount() {
                componentWillMount && componentWillMount()
            }

            componentWillUnmount() {
                componentWillUnmount && componentWillUnmount()
                this.componentWillUnmount$.next()
            }

            render() {
                return React.createElement(WrappedComponent, {
                    ...this.props
                })
            }
        }

        const Component = connectToRedux(props, actions)(ConnectedComponent)
        Component.displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component'
        return Component
    }
}

export function dispatchBatch(type, actions) {
    if (!(actions instanceof Array))
        actions = [actions]
    actions = actions && Array.prototype.concat(...actions).filter((action) => action)
    if (!actions)
        return
    storeInstance.dispatch({
        type: type,
        reduce() {
            return actions.reduce(
                (state, action) => action.reduce(state),
                state()
            )
        }
    })
}