import {Subject, takeUntil} from 'rxjs'
import {composeHoC} from 'compose'
import {connect as connectToRedux} from 'react-redux'
import {isEqual} from 'hash'
import {selectFrom} from 'stateUtils'
import {v4 as uuid} from 'uuid'
import {withPreventUpdateWhenDisabled} from 'enabled'
import React from 'react'
import _ from 'lodash'
import actionBuilder from 'action-builder'

let storeInstance = null
const storeInitListeners = []

export const initStore = store => {
    storeInstance = store
    storeInitListeners.forEach(listener => listener(store))
}

// only used by recipe.js
export const subscribe = (path, listener) => {
    const subscribe = () => storeInstance.subscribe(() => listener(select(path)))
    if (storeInstance) {
        subscribe()
    } else {
        storeInitListeners.push(subscribe)
    }
}

// only used by route.js
export const state = () =>
    storeInstance.getState() || {}

// only used by action-builder.js
export const dispatch = action =>
    storeInstance.dispatch(action)

export const select = (...path) =>
    selectFrom(state(), path)

const includeDispatchingProp = mapStateToProps =>
    (state, ownProps) => ({
        ...mapStateToProps(state, ownProps),
        actions: state.actions || {},
        streams: state.stream && state.stream[ownProps.componentId]
    })

const withConnectedComponent = () =>
    WrappedComponent =>
        class ConnectedComponent extends React.PureComponent {
            constructor(props) {
                super(props)
                this.componentId = uuid()
                this.componentWillUnmount$ = new Subject()
                this.action = this.action.bind(this)
                this.stream = this.stream.bind(this)
            }

            render() {
                return React.createElement(WrappedComponent, {
                    ...this.props,
                    componentId: this.componentId,
                    action: this.action,
                    stream: this.stream,
                    componentWillUnmount$: this.componentWillUnmount$
                })
            }

            componentWillUnmount() {
                this.componentWillUnmount$.next()
                this.componentWillUnmount$.complete()
                this.removeStreamStatus()
            }

            action(type) {
                const actions = select('actions') || {}
                const componentActions = actions[this.componentId] || {}
                const undispatched = !componentActions[type]
                const dispatching = componentActions[type] === 'DISPATCHING'
                const completed = componentActions[type] === 'COMPLETED'
                const failed = componentActions[type] === 'FAILED'
                const dispatched = completed || failed
                return {undispatched, dispatching, completed, failed, dispatched}
            }

            setStreamStatus(name, status) {
                const {componentId} = this
                actionBuilder('SET_STREAM_STATUS', {componentId, name, status})
                    .set(['stream', componentId, name], status)
                    .dispatch()
            }
            
            getStreamStatus(name) {
                const {componentId} = this
                const status = select(['stream', componentId, name])
                return {
                    active: status === 'ACTIVE',
                    failed: status === 'FAILED',
                    completed: status === 'COMPLETED'
                }
            }

            removeStreamStatus() {
                const {componentId} = this
                actionBuilder('REMOVE_STREAM_STATUS', {componentId})
                    .del(['stream', componentId])
                    .dispatch()
            }

            getStream({name, stream$, onNext, onError, onComplete}) {
                if (stream$) {
                    this.setStreamStatus(name, 'ACTIVE')
                    stream$.pipe(
                        takeUntil(this.componentWillUnmount$)
                    ).subscribe({
                        next: value => {
                            onNext && onNext(value)
                        },
                        error: error => {
                            this.setStreamStatus(name, 'FAILED')
                            if (onError) {
                                onError(error)
                            } else {
                                throw error
                            }
                        },
                        complete: () => {
                            this.setStreamStatus(name, 'COMPLETED')
                            onComplete && onComplete()
                        }
                    })
                }
                return this.getStreamStatus(name)
            }

            stream(...args) {
                if (args.length === 1 && _.isObject(args[0])) {
                    // object arguments
                    const {name, stream$, onNext, onError, onComplete} = args
                    return this.getStream({name, stream$, onNext, onError, onComplete})
                } else {
                    // positional arguments
                    const [name, stream$, onNext, onError, onComplete] = args
                    return this.getStream({name, stream$, onNext, onError, onComplete})
                }
            }
        }

const withReduxState = mapStateToProps =>
    connectToRedux(
        includeDispatchingProp(mapStateToProps), null, null, {
            areStatePropsEqual: isEqual
        }
    )

export const connect = mapStateToProps =>
    composeHoC(
        withPreventUpdateWhenDisabled(),
        withReduxState(mapStateToProps || (() => ({}))),
        withConnectedComponent()
    )

// const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component'

// ConnectedComponent.displayName
//     = PreventUpdateWhenDisabled.displayName
//     = `Store(${WrappedComponent.displayName})`

export const dispatchable = action => ({
    ...action,
    dispatch: () => dispatch(action)
})
