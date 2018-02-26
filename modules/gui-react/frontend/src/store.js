let store

export function initStore(reduxStore) {
    store = reduxStore
    return reduxStore
}

export const state = () => store.getState()
export const dispatch = ({type, ...data, reduce}) => store.dispatch({type, ...data, reduce})