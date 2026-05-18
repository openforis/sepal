// User's conversation collection. Knows which conversations exist
// (metadata in Redis), caches their runtime instances in memory, tracks
// the pending→persisted lifecycle (created in memory, only written to
// Redis on first turn), and notifies the channel about each CRUD
// operation as part of completing it.

const {EMPTY, concat, concatMap, defer, filter, from, ignoreElements, map, of, tap} = require('rxjs')

function createConversations({conversationsStore, conversationFor$, createId, clock}) {
    const instances = new Map()
    const pendingMetas = new Map()

    return {
        create$, select$, delete$, deleteAll$, list$, abort$,
        get$, peek, persistOrTouch$
    }

    function create$({channel}) {
        return defer(() => {
            const id = createId()
            const now = clock.nowIso()
            const meta = {id, title: '', createdAt: now, updatedAt: now}
            pendingMetas.set(id, meta)
            return conversationFor$(id).pipe(
                tap(conversation => {
                    instances.set(id, conversation)
                    channel.conversationCreated(meta)
                    channel.conversationClaimed(meta)
                }),
                ignoreElements()
            )
        })
    }

    function select$({channel, conversationId}) {
        return get$(conversationId).pipe(
            tap(conversation => {
                channel.conversationLoaded(conversationId, conversation.messagesSnapshot())
                if (conversation.isStreaming) channel.status(conversationId)
            }),
            ignoreElements()
        )
    }

    function delete$({channel, conversationId}) {
        return defer(() => {
            instances.get(conversationId)?.abort()
            instances.delete(conversationId)
            if (pendingMetas.delete(conversationId)) {
                channel.conversationDeleted(conversationId)
                return EMPTY
            }
            return conversationsStore.delete$(conversationId).pipe(
                tap(deleted => {
                    if (deleted) channel.conversationDeleted(conversationId)
                }),
                ignoreElements()
            )
        })
    }

    function deleteAll$({channel}) {
        return concat(
            conversationsStore.list$().pipe(concatMap(metas => from(metas.map(meta => meta.id)))),
            defer(() => from([...pendingMetas.keys()]))
        ).pipe(
            concatMap(conversationId => delete$({channel, conversationId}))
        )
    }

    function list$({channel}) {
        return conversationsStore.list$().pipe(
            tap(metas => channel.conversationsList(metas)),
            ignoreElements()
        )
    }

    function abort$({conversationId}) {
        return defer(() => {
            instances.get(conversationId)?.abort()
            return EMPTY
        })
    }

    function get$(id) {
        const cached = instances.get(id)
        if (cached) return of(cached)
        return conversationsStore.get$(id).pipe(
            filter(Boolean),
            concatMap(() => conversationFor$(id).pipe(
                tap(conversation => instances.set(id, conversation))
            ))
        )
    }

    function peek(id) {
        return instances.get(id)
    }

    function persistOrTouch$(id, now) {
        const pending = pendingMetas.get(id)
        if (pending) {
            pendingMetas.delete(id)
            return conversationsStore.add$({...pending, updatedAt: now})
        }
        return conversationsStore.touch$(id, now).pipe(
            filter(touched => touched)
        )
    }
}

module.exports = {createConversations}
