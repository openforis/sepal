// User's conversation collection: which conversations exist, their
// cached runtime instances, the pending→persisted lifecycle (created
// in memory, only written to Redis on first turn), and CRUD channel
// events.

const {EMPTY, concat, concatMap, defer, filter, from, of} = require('rxjs')
const {
    TARGETED,
    conversationCreated, conversationClaimed, conversationLoaded,
    conversationDeleted, conversationPendingActionCreated, conversationsList, status
} = require('../channelEvents')

function createConversations({conversationsStore, conversationFor$, createId, clock, pendingActions}) {
    const instances = new Map()
    const pendingMetas = new Map()

    return {
        create$, select$, delete$, deleteAll$, list$, abort$,
        get$, persistOrTouch$
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
            concatMap(conversation => from(selectEvents(conversation, conversationId)))
        )
    }

    // Order: loaded → pending-action-created (when active) → status (when
    // streaming). The pending projection is targeted at the selecting
    // subscription — only that client needs to learn about an in-flight
    // clarification it missed. Live recording stays broadcast so every tab
    // sees a fresh clarification as it happens.
    function selectEvents(conversation, conversationId) {
        const events = [conversationLoaded(conversationId, conversation.messagesSnapshot())]
        const pending = pendingActions.clientView(conversationId)
        if (pending) events.push(conversationPendingActionCreated({conversationId, pendingAction: pending, targeting: TARGETED}))
        if (conversation.isStreaming) events.push(status(conversationId))
        return events
    }

    function delete$({conversationId}) {
        return defer(() => {
            instances.get(conversationId)?.abort()
            instances.delete(conversationId)
            pendingActions.clear(conversationId)
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
