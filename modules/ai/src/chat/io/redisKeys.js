function conversationsKey(username) {
    return `ai:chat:${username}:conversations`
}

function historyKey(username, conversationId) {
    return `ai:chat:${username}:conversation:${conversationId}:history`
}

function ttlSeconds(ttlMs) {
    return Math.ceil(ttlMs / 1000)
}

module.exports = {conversationsKey, historyKey, ttlSeconds}
