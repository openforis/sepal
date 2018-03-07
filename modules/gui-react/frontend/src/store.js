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

export function epic(type, epic) {
        storeInstance.dispatch({type, epic})
}

export function updateState(type, valueByPath) {
    return {
        type,
        reduce(state) {
            return ({...state, ...valueByPath})
        }
    }
}
