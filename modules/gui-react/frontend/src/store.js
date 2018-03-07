let storeInstance = null

export function initStore(store) {
    storeInstance = store
}

export default function store() {
    return storeInstance
}