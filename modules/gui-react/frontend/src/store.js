import React from 'react'
import {connect as connectToRedux} from 'react-redux'

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

export function connect({props, actions}) {
    const connected = connectToRedux(props, actions)
    return (WrappedComponent) => {
        const connectedComponent = connected(WrappedComponent)
        connectedComponent.dispatchEpic = function (type, epic) {
            return storeInstance.dispatch({type: type, epic})
        }
        return connectedComponent
    }
}