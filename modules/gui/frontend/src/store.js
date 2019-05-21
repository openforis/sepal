import {Subject} from 'rxjs'
import {connect as connectToRedux} from 'react-redux'
import {isMobile} from 'widget/userAgent'
import {selectFrom} from 'stateUtils'
import {takeUntil} from 'rxjs/operators'
import PropTypes from 'prop-types'
import React, {Component} from 'react'
import _ from 'lodash'
import actionBuilder from 'action-builder'
import asyncActionBuilder from 'async-action-builder'
import guid from 'guid'

let storeInstance = null
const storeInitListeners = []

export const initStore = store => {
    storeInstance = store
    storeInitListeners.forEach(listener => listener(store))
}

export const subscribe = (path, listener) => {
    const subscribe = () => storeInstance.subscribe(() => listener(select(path)))
    if (storeInstance)
        subscribe()
    else
        storeInitListeners.push(subscribe)
}

export const state = () =>
    storeInstance.getState() || {}

export const dispatch = action =>
    storeInstance.dispatch(action)

export const select = (...path) =>
    selectFrom(state(), path)
    // _.cloneDeep(selectFrom(state(), path))

const includeDispatchingProp = (id, mapStateToProps) =>
    (state, ownProps) => {
        if (ownProps.enabled === false)
            return {}
        return {
            ...mapStateToProps(state, ownProps),
            actions: state.actions || {},
            streams: state.stream && state.stream[id]
        }
    }

export const connect = mapStateToProps => {
    mapStateToProps = mapStateToProps ? mapStateToProps : () => ({})

    return WrappedComponent => {
        const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component'
        const id = `${displayName}:${guid()}`

        class PreventUpdateWhenDisabled extends Component {
            shouldComponentUpdate(nextProps) {
                return nextProps.enabled !== false
            }

            render() {
                return (
                    <WrappedComponent {...this.props}>
                        {this.props.children}
                    </WrappedComponent>
                )
            }
        }

        class AddEnabledProp extends Component {
            render() {
                return (
                    <EnabledContext.Consumer>
                        {enabled =>
                            <ConnectedComponent {...this.props} enabled={enabled}>
                                {this.props.children}
                            </ConnectedComponent>
                        }
                    </EnabledContext.Consumer>
                )
            }
        }

        const ReduxConnectedComponent = connectToRedux(
            includeDispatchingProp(id, mapStateToProps), null, null, {
                areStatePropsEqual: _.isEqual
            }
        )(PreventUpdateWhenDisabled)

        class ConnectedComponent extends React.PureComponent {
            constructor(props) {
                super(props)
                this.id = id
                this.componentWillUnmount$ = new Subject()
                this.asyncActionBuilder = this.asyncActionBuilder.bind(this)
                this.action = this.action.bind(this)
                this.setDisableListener = this.setDisableListener.bind(this)
                this.setEnableListener = this.setEnableListener.bind(this)
                this.stream = stream(this)
            }

            componentWillUnmount() {
                this.componentWillUnmount$.next()
                this.componentWillUnmount$.complete()
            }

            asyncActionBuilder(type, action$) {
                return asyncActionBuilder(type, action$, this)
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

            setDisableListener(listener) {
                this.onDisable = listener
            }

            setEnableListener(listener) {
                this.onEnable = listener
            }

            render() {
                return React.createElement(ReduxConnectedComponent, {
                    ...this.props,
                    asyncActionBuilder: this.asyncActionBuilder,
                    action: this.action,
                    stream: this.stream,
                    onEnable: this.setEnableListener,
                    onDisable: this.setDisableListener,
                    componentId: this.id,
                    componentWillUnmount$: this.componentWillUnmount$
                })
            }

            componentDidUpdate(prevProps) {
                const wasEnabled = prevProps.enabled
                const isEnabled = this.props.enabled
                if (this.onEnable && wasEnabled !== true && isEnabled === true) {
                    this.onEnable()
                } else if (this.onDisable && wasEnabled !== false && isEnabled === false) {
                    this.onDisable()
                }
            }
        }

        ConnectedComponent.displayName
            = AddEnabledProp.displayName
            = PreventUpdateWhenDisabled.displayName
            = `Store(${WrappedComponent.displayName})`

        return AddEnabledProp
    }
}

export const dispatchable = action => ({
    ...action,
    dispatch: () => dispatch(action)
})

const EnabledContext = React.createContext()

export class Enabled extends React.PureComponent {
    render() {
        const {value, children} = this.props
        return (
            <EnabledContext.Consumer>
                {parentValue =>
                    <EnabledContext.Provider value={value !== false && parentValue !== false}>
                        {children}
                    </EnabledContext.Provider>
                }
            </EnabledContext.Consumer>
        )
    }

    componentDidUpdate(prevProps) {
        const prevValue = prevProps.value
        const value = this.props.value
        if (!value && value !== prevValue && document.activeElement && isMobile()) {
            document.activeElement && document.activeElement.blur()
        }
    }
}

Enabled.propTypes = {
    children: PropTypes.any.isRequired,
    value: PropTypes.any.isRequired
}

const stream = component => {
    const streamStatus = status => ({
        active: status === 'ACTIVE',
        failed: status === 'FAILED',
        completed: status === 'COMPLETED'
    })

    return (name, stream$, onSuccess, onError, onComplete) => {
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
                    onSuccess && onSuccess(next)
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
}
