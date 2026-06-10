// Runtime GUI context cache, keyed by (clientId, subscriptionId).

import {defer, EMPTY} from 'rxjs'

function createGuiContexts() {
    const contexts = new Map()

    return {update$, clear$, get}

    function update$({clientId, subscriptionId, guiContext}) {
        return defer(() => {
            contexts.set(keyOf({clientId, subscriptionId}), guiContext)
            return EMPTY
        })
    }

    function clear$({clientId, subscriptionId}) {
        return defer(() => {
            contexts.delete(keyOf({clientId, subscriptionId}))
            return EMPTY
        })
    }

    function get(clientId, subscriptionId) {
        return contexts.get(keyOf({clientId, subscriptionId}))
    }
}

function keyOf({clientId, subscriptionId}) {
    return `${clientId}:${subscriptionId}`
}

export {createGuiContexts}
