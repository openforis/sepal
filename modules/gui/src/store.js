import {selectFrom} from '~/stateUtils'

let storeInstance = null
const storeInitListeners = []

export const initStore = store => {
    storeInstance = store
    storeInitListeners.forEach(listener => listener(store))
}

// returns an unsubscribe function (no-op until the deferred subscribe runs)
export const subscribe = (path, listener) => {
    let unsubscribe = () => {}
    const doSubscribe = () => {
        unsubscribe = storeInstance.subscribe(() => listener(select(path)))
    }
    if (storeInstance) {
        doSubscribe()
    } else {
        storeInitListeners.push(doSubscribe)
    }
    return () => unsubscribe()
}

// only used by route.js
export const state = () =>
    storeInstance.getState() || {}

// only used by action-builder.js
export const dispatch = action =>
    storeInstance.dispatch(action)

export const select = (...path) =>
    selectFrom(state(), path)

