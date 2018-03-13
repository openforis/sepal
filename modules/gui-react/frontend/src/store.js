import React from 'react'
import {connect as connectToRedux} from 'react-redux'
import asyncActionBuilder from 'async-action-builder'
import guid from 'guid'
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

export function fromState(path) {
    const parts = path.split('.')
    return parts.reduce((state, part) => {
        if (state == null)
            return undefined
        return state[part]
    }, state())
}

export function connect(mapStateToProps) {
    mapStateToProps = mapStateToProps ? mapStateToProps : () => ({})
    return (WrappedComponent) => {
        const wrappedMapStateToProps = (state, ownProps) => {
            const dispatchingActions = (state.dispatching || {})[ownProps.componentId] || {}
            const dispatching = {}
            Object.values(dispatchingActions).forEach((type) => dispatching[type] = true)
            const props = {
                ...mapStateToProps(state, ownProps),
                dispatching
            }
            return props
        }
        WrappedComponent = connectToRedux(wrappedMapStateToProps)(WrappedComponent)

        class ConnectedComponent extends React.Component {
            constructor(props) {
                super(props)
                this.id = `${componentDisplayName(WrappedComponent)}:${guid()}`
                this.componentWillUnmount$ = new Rx.Subject()
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
                    componentId: this.id
                })
            }
        }

        // const Component = connectToRedux(wrappedMapStateToProps)(ConnectedComponent)
        // Component.displayName = componentDisplayName(WrappedComponent)
        // return Component
        return ConnectedComponent
    }
}

function componentDisplayName(Component) {
    return Component.displayName || Component.name || 'Component'
}