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
        const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component'
        console.log('store displayName WrappedComponent', displayName)
        WrappedComponent = connectToRedux(includeDispatchingProp(mapStateToProps))(WrappedComponent)
        console.log('store displayName WrappedComponent after redux connect', displayName)

        class ConnectedComponent extends React.Component {
            constructor(props) {
                super(props)
                this.id = `${displayName}:${guid()}`
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

        ConnectedComponent.displayName = `Store(${WrappedComponent.displayName})`
        return ConnectedComponent
    }
}

function includeDispatchingProp(mapStateToProps) {
    return (state, ownProps) => {
        const dispatchingActions = (state.dispatching || {})[ownProps.componentId] || {}
        const dispatching = {}
        Object.values(dispatchingActions).forEach((type) => dispatching[type] = true)
        return {
            ...mapStateToProps(state, ownProps),
            dispatching
        }
    }
}