function createInMemoryConversationsStore() {
    const conversations = new Map()
    return {add, get, touch, delete: remove, list}

    function add(meta) {
        conversations.set(meta.id, meta)
    }

    function get(id) {
        return conversations.get(id)
    }

    function touch(id, updatedAt) {
        const meta = conversations.get(id)
        if (!meta) return false
        meta.updatedAt = updatedAt
        return true
    }

    function remove(id) {
        return conversations.delete(id)
    }

    function list() {
        return [...conversations.values()]
    }
}

module.exports = {createInMemoryConversationsStore}
