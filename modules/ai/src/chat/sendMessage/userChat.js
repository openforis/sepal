const {EMPTY, Subject, catchError, concat, concatMap, defer, filter, finalize, from, ignoreElements, map, of, shareReplay, takeUntil, tap} = require('rxjs')

const COMMANDS = {
    'create-conversation': 'createConversation$',
    'select-conversation': 'selectConversation$',
    'delete-conversation': 'deleteConversation$',
    'delete-all-conversations': 'deleteAllConversations$',
    'list-conversations': 'listConversations$',
    'message': 'sendUserMessage$',
    'abort': 'abort$'
}

function createUserChat({conversationsStore, conversationFor$, createId, clock, titleGenerator}) {
    const conversations = new Map()
    const pendingMetas = new Map()
    const streaming = new Set()
    const contexts = new Map()
    const turnTails = new Map()
    const abortRequests$ = new Subject()

    return {
        createConversation$,
        selectConversation$,
        deleteConversation$,
        deleteAllConversations$,
        listConversations$,
        sendUserMessage$,
        updateContext$,
        clearContext$,
        abort$
    }

    function createConversation$({channel}) {
        return defer(() => {
            const id = createId()
            const now = clock.nowIso()
            const meta = {id, title: '', createdAt: now, updatedAt: now}
            pendingMetas.set(id, meta)
            return conversationFor$(id).pipe(
                tap(conversation => {
                    conversations.set(id, conversation)
                    channel.conversationCreated(meta)
                    channel.conversationClaimed(meta)
                }),
                ignoreElements()
            )
        })
    }

    function selectConversation$({channel, conversationId}) {
        return conversation$(conversationId).pipe(
            tap(conversation => {
                channel.conversationLoaded(conversationId, conversation.messagesSnapshot())
                if (streaming.has(conversationId)) channel.status(conversationId)
            }),
            ignoreElements()
        )
    }

    function deleteConversation$({channel, conversationId}) {
        return defer(() => {
            abortRequests$.next(conversationId)
            conversations.delete(conversationId)
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

    function deleteAllConversations$({channel}) {
        return conversationsStore.list$().pipe(
            concatMap(metas => from([
                ...metas.map(meta => meta.id),
                ...pendingMetas.keys()
            ])),
            concatMap(id => deleteConversation$({channel, conversationId: id}))
        )
    }

    function listConversations$({channel}) {
        return conversationsStore.list$().pipe(
            tap(metas => channel.conversationsList(metas)),
            ignoreElements()
        )
    }

    function sendUserMessage$({channel, conversationId, text, clientId, subscriptionId, selection: messageSelection}) {
        const selection = messageSelection ?? contexts.get(contextKey({clientId, subscriptionId}))
        const turn = {
            channel, conversationId, text, selection,
            toolContext: {channel, conversationId, clientId, subscriptionId, selection}
        }
        return defer(() => enqueueTurn$(turn))
    }

    // Serialize turns per conversation: each turn's stream chains onto the
    // previous turn's stream completion, so sends can't interleave on the
    // shared message history. Title generation runs after, but off the queue
    // tail — a slow title must not delay the next turn.
    function enqueueTurn$(turn) {
        const {conversationId} = turn
        const previousStream$ = turnTails.get(conversationId) ?? EMPTY
        const stream$ = concat(
            previousStream$.pipe(ignoreElements(), catchError(() => EMPTY)),
            defer(() => streamTurn$(turn))
        ).pipe(
            finalize(() => {
                if (turnTails.get(conversationId) === stream$) {
                    turnTails.delete(conversationId)
                }
            }),
            shareReplay({bufferSize: 1, refCount: false})
        )
        turnTails.set(conversationId, stream$)
        return concat(stream$, defer(() => generateTitle$(turn)))
    }

    function streamTurn$({channel, conversationId, text, selection, toolContext}) {
        return conversation$(conversationId).pipe(
            concatMap(conversation =>
                persistOrTouch$(conversationId).pipe(map(() => conversation))
            ),
            concatMap(conversation =>
                streamReply$(channel, conversation, conversationId, text, {selection, toolContext})
            )
        )
    }

    function generateTitle$({channel, conversationId, text}) {
        return conversation$(conversationId).pipe(
            concatMap(conversation =>
                titleGenerator.afterTurn$({channel, conversation, conversationId, userText: text})
            )
        )
    }

    function updateContext$({clientId, subscriptionId, selection}) {
        return defer(() => {
            contexts.set(contextKey({clientId, subscriptionId}), selection)
            return EMPTY
        })
    }

    function clearContext$({clientId, subscriptionId}) {
        return defer(() => {
            contexts.delete(contextKey({clientId, subscriptionId}))
            return EMPTY
        })
    }

    function persistOrTouch$(conversationId) {
        const now = clock.nowIso()
        const pending = pendingMetas.get(conversationId)
        if (pending) {
            pendingMetas.delete(conversationId)
            return conversationsStore.add$({...pending, updatedAt: now})
        }
        return conversationsStore.touch$(conversationId, now).pipe(
            filter(touched => touched)
        )
    }

    function streamReply$(channel, conversation, conversationId, text, {selection, toolContext}) {
        return defer(() => {
            streaming.add(conversationId)
            channel.status(conversationId)
            channel.userMessage(conversationId, text)
            return conversation.sendUserMessage$(text, {selection, toolContext}).pipe(
                tap(event => routeTurnEvent(channel, conversationId, event)),
                takeUntil(abortRequests$.pipe(filter(id => id === conversationId))),
                finalize(() => {
                    streaming.delete(conversationId)
                    channel.chatResponse({conversationId, complete: true})
                }),
                ignoreElements()
            )
        })
    }

    function abort$({conversationId}) {
        return defer(() => {
            if (streaming.has(conversationId)) abortRequests$.next(conversationId)
            return EMPTY
        })
    }

    function conversation$(id) {
        const cached = conversations.get(id)
        if (cached) return of(cached)
        return conversationsStore.get$(id).pipe(
            filter(Boolean),
            concatMap(() => conversationFor$(id).pipe(
                tap(conversation => conversations.set(id, conversation))
            ))
        )
    }
}

function routeTurnEvent(channel, conversationId, event) {
    if (event.toolStart) {
        channel.toolStart({conversationId, ...event.toolStart})
    } else if (event.toolEnd) {
        channel.toolEnd({conversationId, ...event.toolEnd})
    } else {
        channel.chatResponse({conversationId, ...event})
    }
}

function contextKey({clientId, subscriptionId}) {
    return `${clientId}:${subscriptionId}`
}

module.exports = {createUserChat, COMMANDS}
