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

export function dispatch(action) {
    storeInstance.dispatch(action)
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


export function connect(mapStateToProps = () => ({})) {
    return (WrappedComponent) => {
        class ConnectedComponent extends React.Component {
            constructor(props) {
                super(props)
                this.componentWillUnmount$ = new Rx.Subject()
                this.actionBuilder = this.actionBuilder.bind(this)
            }

            componentWillUnmount() {
                this.componentWillUnmount$.next()
                this.componentWillUnmount$.complete()
            }

            actionBuilder(type, action$) {
                if (!type) throw new Error('Action type is required')
                const component = this


                let actionsToDispatch = []
                const addActions = (actions) => {
                    if (!actions) return
                    if (!actions instanceof Array)
                        actions = [actions]
                    actionsToDispatch = actionsToDispatch.concat(actions)
                }
                let onComplete

                return {
                    onComplete(callback) {
                        onComplete = callback
                        return this
                    },

                    dispatch() {
                        const observer = {
                            next(actions) {
                                addActions(actions)
                            },

                            complete() {
                                addActions(onComplete && onComplete())
                                console.log(actionsToDispatch)
                                return storeInstance.dispatch({
                                    type: type,
                                    actions: actionsToDispatch,
                                    reduce() {
                                        return actionsToDispatch.reduce(
                                            (state, action) => action.reduce ? action.reduce(state) : state,
                                            state()
                                        )
                                    }
                                })
                            }
                        }

                        action$
                            .takeUntil(component.componentWillUnmount$)
                            .subscribe(observer)
                    }
                }
            }

            render() {
                return React.createElement(WrappedComponent, {
                    ...this.props,
                    actionBuilder: this.actionBuilder
                })
            }
        }

        const Component = connectToRedux(mapStateToProps)(ConnectedComponent)
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