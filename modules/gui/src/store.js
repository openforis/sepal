import {selectFrom} from 'stateUtils'

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

