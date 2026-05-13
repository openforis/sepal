const {defer, of} = require('rxjs')

function createInMemoryConversationsStore(initial = []) {
    const conversations = new Map(initial.map(meta => [meta.id, meta]))
    return {add$, get$, touch$, updateTitle$, delete$, list$}

    function add$(meta) {
        return defer(() => {
            conversations.set(meta.id, meta)
            return of(undefined)
        })
    }

    function get$(id) {
        return defer(() => of(conversations.get(id)))
    }

    function touch$(id, updatedAt) {
        return defer(() => {
            const meta = conversations.get(id)
            if (!meta) return of(false)
            conversations.set(id, {...meta, updatedAt})
            return of(true)
        })
    }

    function updateTitle$(id, title) {
        return defer(() => {
            const meta = conversations.get(id)
            if (!meta) return of(false)
            conversations.set(id, {...meta, title})
            return of(true)
        })
    }

    function delete$(id) {
        return defer(() => of(conversations.delete(id)))
    }

    function list$() {
        return defer(() =>
            of([...conversations.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
        )
    }
}

module.exports = {createInMemoryConversationsStore}
