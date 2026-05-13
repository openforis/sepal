const {EMPTY, Subject, concatMap, defer, filter, finalize, from, ignoreElements, map, of, takeUntil, tap} = require('rxjs')

const COMMANDS = {
    'create-conversation': 'createConversation$',
    'select-conversation': 'selectConversation$',
    'delete-conversation': 'deleteConversation$',
    'delete-all-conversations': 'deleteAllConversations$',
    'list-conversations': 'listConversations$',
    'message': 'sendUserMessage$',
    'abort': 'abort$'
}

function createUserChat({conversationsStore, conversationFor$, createId, clock}) {
    const conversations = new Map()
    const streaming = new Set()
    const abortRequests$ = new Subject()

    return {
        createConversation$,
        selectConversation$,
        deleteConversation$,
        deleteAllConversations$,
        listConversations$,
        sendUserMessage$,
        abort$
    }

    function createConversation$({channel}) {
        return defer(() => {
            const id = createId()
            const now = clock.nowIso()
            const meta = {id, title: '', createdAt: now, updatedAt: now}
            return conversationFor$(id).pipe(
                concatMap(conversation =>
                    conversationsStore.add$(meta).pipe(map(() => conversation))
                ),
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
            concatMap(metas => from(metas)),
            concatMap(meta => deleteConversation$({channel, conversationId: meta.id}))
        )
    }

    function listConversations$({channel}) {
        return conversationsStore.list$().pipe(
            tap(metas => channel.conversationsList(metas)),
            ignoreElements()
        )
    }

    function sendUserMessage$({channel, conversationId, text}) {
        return conversation$(conversationId).pipe(
            concatMap(conversation =>
                conversationsStore.touch$(conversationId, clock.nowIso()).pipe(
                    filter(touched => touched),
                    map(() => conversation)
                )
            ),
            concatMap(conversation => streamReply$(channel, conversation, conversationId, text))
        )
    }

    function streamReply$(channel, conversation, conversationId, text) {
        return defer(() => {
            streaming.add(conversationId)
            channel.status(conversationId)
            channel.userMessage(conversationId, text)
            return conversation.sendUserMessage$(text).pipe(
                tap(event => channel.chatResponse({conversationId, ...event})),
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

module.exports = {createUserChat, COMMANDS}
