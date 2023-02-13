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

export const subscribe = (path, listener) => {
    const subscribe = () => storeInstance.subscribe(() => listener(select(path)))
    if (storeInstance) {
        subscribe()
    } else {
        storeInitListeners.push(subscribe)
    }
}

export const state = () =>
    storeInstance.getState() || {}

export const dispatch = action =>
    storeInstance.dispatch(action)

export const select = (...path) =>
    selectFrom(state(), path)
    // _.cloneDeep(selectFrom(state(), path))

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
                this.id = uuid()
                this.componentWillUnmount$ = new Subject()
                this.action = this.action.bind(this)
                this.stream = stream(this)
            }

            componentWillUnmount() {
                this.componentWillUnmount$.next()
                this.componentWillUnmount$.complete()
            }

            action(type) {
                const actions = select('actions') || {}
                const componentActions = actions[this.id] || {}
                const undispatched = !componentActions[type]
                const dispatching = componentActions[type] === 'DISPATCHING'
                const completed = componentActions[type] === 'COMPLETED'
                const failed = componentActions[type] === 'FAILED'
                const dispatched = completed || failed
                return {undispatched, dispatching, completed, failed, dispatched}
            }

            render() {
                return React.createElement(WrappedComponent, {
                    ...this.props,
                    componentId: this.id,
                    action: this.action,
                    stream: this.stream,
                    componentWillUnmount$: this.componentWillUnmount$
                })
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

const stream = component => {
    const streamStatus = status => ({
        active: status === 'ACTIVE',
        failed: status === 'FAILED',
        completed: status === 'COMPLETED'
    })

    const f = ({name, stream$, onNext, onError, onComplete}) => {
        const componentPath = `stream.${component.id}`
        const statePath = `${componentPath}.${name}`

        if (!stream$) {
            return streamStatus(select(statePath))
        }

        const setStatus = status =>
            actionBuilder('SET_STREAM_STATUS', {statePath, status})
                .set(statePath, status)
                .dispatch()

        setStatus('ACTIVE')

        let unmounted = false
        component.componentWillUnmount$.subscribe(() => {
            unmounted = true
            select(componentPath) && actionBuilder('REMOVE_STREAM_STATUS', {componentPath, name})
                .del(componentPath)
                .dispatch()
        })

        stream$
            .pipe(
                takeUntil(component.componentWillUnmount$)
            ).subscribe(
                next => {
                    onNext && onNext(next)
                },
                error => {
                    unmounted || setStatus('FAILED')
                    if (onError) {
                        onError(error)
                    } else {
                        throw error
                    }
                },
                () => {
                    unmounted || setStatus('COMPLETED')
                    onComplete && onComplete()
                }
            )
    }

    return (...args) => {
        if (args.length === 1 && _.isObject(args[0])) {
            return f(args[0])
        } else {
            const [name, stream$, onNext, onError, onComplete] = args
            return f({name, stream$, onNext, onError, onComplete})
        }
    }
}
