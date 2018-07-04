import asyncActionBuilder from 'async-action-builder'
import guid from 'guid'
import PropTypes from 'prop-types'
import React from 'react'
import {connect as connectToRedux} from 'react-redux'
import {Subject} from 'rxjs'

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
    if (typeof path === 'string')
        path = path.split('.')
    return path.reduce((state, part) => {
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

        ConnectedComponent.displayName = `Store(${WrappedComponent.displayName})`
        return (props) =>
            <EnabledContext.Consumer>
                {enabled =>
                    <ConnectedComponent {...props} enabled={enabled}>
                        {props.children}
                    </ConnectedComponent>
                }
            </EnabledContext.Consumer>
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
    value: PropTypes.any.isRequired,
    children: PropTypes.any.isRequired
}