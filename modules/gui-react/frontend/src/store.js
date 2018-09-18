import {Subject} from 'rxjs'
import {connect as connectToRedux} from 'react-redux'
import {takeUntil} from 'rxjs/operators'
import {toPathList} from 'collections'
import PropTypes from 'prop-types'
import React from 'react'
import asyncActionBuilder from 'async-action-builder'
import guid from 'guid'


let storeInstance = null
const storeInitListeners = []

export function initStore(store) {
    storeInstance = store
    storeInitListeners.forEach((listener) => listener(store))
}

export function subscribe(path, listener) {
    const subscribe = () => storeInstance.subscribe(() => listener(select(path)))
    if (storeInstance)
        subscribe()
    else
        storeInitListeners.push(subscribe)
}

export function state() {
    return storeInstance.getState() || {}
}

export function dispatch(action) {
    storeInstance.dispatch(action)
}

export function select(path) {
    return toPathList(path).reduce((state, part) => {
        return state != null && state[part] != null ? state[part] : undefined
    }, state())
}

export function connect(mapStateToProps) {
    mapStateToProps = mapStateToProps ? mapStateToProps : () => ({})
    return (WrappedComponent) => {
        const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component'
        WrappedComponent = connectToRedux(includeDispatchingProp(mapStateToProps))(WrappedComponent)
        WrappedComponent.prototype.shouldComponentUpdate = (nextProps) => {
            return nextProps.enabled !== false
        }

        class ConnectedComponent extends React.Component {
            constructor(props) {
                super(props)
                this.id = `${displayName}:${guid()}`
                this.componentWillUnmount$ = new Subject()
                this.asyncActionBuilder = this.asyncActionBuilder.bind(this)
            }

            componentWillUnmount() {
                this.componentWillUnmount$.next()
                this.componentWillUnmount$.complete()
            }

            asyncActionBuilder(type, action$) {
                return asyncActionBuilder(type, action$, this)
            }

            render() {
                return React.createElement(WrappedComponent, {
                    ...this.props,
                    asyncActionBuilder: this.asyncActionBuilder,
                    stream: stream(this),
                    onEnable: (listener) => this.onEnable = listener,
                    onDisable: (listener) => this.onDisable = listener,
                    componentId: this.id,
                    componentWillUnmount$: this.componentWillUnmount$
                })
            }

            componentDidUpdate(prevProps) {
                const wasEnabled = prevProps.enabled
                const isEnabled = this.props.enabled
                if (wasEnabled !== true && isEnabled === true && this.onEnable)
                    this.onEnable()
                else if (wasEnabled !== false && isEnabled === false && this.onDisable)
                    this.onDisable()
            }
        }

        const ComponentWithContext = (props) =>
            <EnabledContext.Consumer>
                {enabled =>
                    <ConnectedComponent {...props} enabled={enabled}>
                        {props.children}
                    </ConnectedComponent>
                }
            </EnabledContext.Consumer>

        ConnectedComponent.displayName
            = ComponentWithContext.displayName
            = `Store(${WrappedComponent.displayName})`
        return ComponentWithContext
    }
}

function includeDispatchingProp(mapStateToProps) {
    return (state, ownProps) => {
        const actions = state.actions || {}
        const componentActions = actions[ownProps.componentId] || {}
        const action = (type) => {
            const undispatched = !componentActions[type]
            const dispatching = componentActions[type] === 'DISPATCHING'
            const completed = componentActions[type] === 'COMPLETED'
            const failed = componentActions[type] === 'FAILED'
            const dispatched = completed || failed
            return {undispatched, dispatching, completed, failed, dispatched}
        }
        return {
            ...mapStateToProps(state, ownProps),
            action
        }
    }
}

export function dispatchable(action) {
    return {
        ...action,
        dispatch: () => dispatch(action)
    }
}

const EnabledContext = React.createContext()

export class Enabled extends React.Component {
    render() {
        const {value, children} = this.props
        return (
            <EnabledContext.Provider value={!!value}>
                {children}
            </EnabledContext.Provider>
        )
    }
}

Enabled.propTypes = {
    children: PropTypes.any.isRequired,
    value: PropTypes.any.isRequired
}

const stream = (component) => {
    return (name, stream$, ...subscriber) => {
        component.state || (component.state = {})

        const stateKey = 'stream.' + name
        if (!stream$)
            return component.state[stateKey]

        const transformed$ = stream$.pipe(
            takeUntil(component.componentWillUnmount$)
        )

        const setStatus = (status) =>
            component.setState((prevState) => ({...prevState, [stateKey]: status}))

        setStatus('ACTIVE')

        transformed$.subscribe(
            null,
            () => setStatus('FAILED'),
            () => setStatus('COMPLETED'),
        )

        if (subscriber.length > 0)
            transformed$.subscribe(...subscriber)
    }
}
