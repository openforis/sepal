// User's conversation collection: which conversations exist, their
// cached runtime instances, the pending→persisted lifecycle (created
// in memory, only written to Redis on first turn), and CRUD channel
// events.

const {EMPTY, concat, concatMap, defer, filter, from, of} = require('rxjs')
const {
    conversationCreated, conversationClaimed, conversationLoaded,
    conversationDeleted, conversationsList, status
} = require('../channelEvents')

function createConversations({conversationsStore, conversationFor$, createId, clock}) {
    const instances = new Map()
    const pendingMetas = new Map()

    return {
        create$, select$, delete$, deleteAll$, list$, abort$,
        get$, peek, persistOrTouch$
    }

    function create$() {
        return defer(() => {
            const id = createId()
            const now = clock.nowIso()
            const meta = {id, title: '', createdAt: now, updatedAt: now}
            pendingMetas.set(id, meta)
            return conversationFor$(id).pipe(
                concatMap(conversation => {
                    instances.set(id, conversation)
                    return from([conversationCreated(meta), conversationClaimed(meta)])
                })
            )
        })
    }

    function select$({conversationId}) {
        return get$(conversationId).pipe(
            concatMap(conversation => {
                const loaded = conversationLoaded(conversationId, conversation.messagesSnapshot())
                return conversation.isStreaming
                    ? from([loaded, status(conversationId)])
                    : of(loaded)
            })
        )
    }

    function delete$({conversationId}) {
        return defer(() => {
            instances.get(conversationId)?.abort()
            instances.delete(conversationId)
            if (pendingMetas.delete(conversationId)) {
                return of(conversationDeleted(conversationId))
            }
            return conversationsStore.delete$(conversationId).pipe(
                concatMap(deleted => deleted ? of(conversationDeleted(conversationId)) : EMPTY)
            )
        })
    }

    function deleteAll$() {
        return concat(
            conversationsStore.list$().pipe(concatMap(metas => from(metas.map(meta => meta.id)))),
            defer(() => from([...pendingMetas.keys()]))
        ).pipe(
            concatMap(conversationId => delete$({conversationId}))
        )
    }

    function list$() {
        return conversationsStore.list$().pipe(
            concatMap(metas => of(conversationsList(metas)))
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
                concatMap(conversation => {
                    instances.set(id, conversation)
                    return of(conversation)
                })
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
