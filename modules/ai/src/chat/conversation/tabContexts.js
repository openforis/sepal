// Per-tab GUI selection memory, keyed by (clientId, subscriptionId).
// Stored when a 'context' command arrives and read as the fallback
// selection on subsequent 'message' commands from the same tab.

const {EMPTY, defer} = require('rxjs')

function createTabContexts() {
    const contexts = new Map()

    return {update$, clear$, get}

    function update$({clientId, subscriptionId, selection}) {
        return defer(() => {
            contexts.set(keyOf({clientId, subscriptionId}), selection)
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

module.exports = {createTabContexts}
