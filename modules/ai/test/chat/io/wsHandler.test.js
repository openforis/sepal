const {Subject} = require('rxjs')
const {createInMemoryConversationsStore} = require('#mcp/chat/io/conversationsStore')
const {createWsHandler} = require('#mcp/chat/io/wsHandler')
const {createConversation} = require('#mcp/chat/sendMessage/conversation')
const {createUserChat} = require('#mcp/chat/sendMessage/userChat')
const {aFakeHistory, aFakeLlm, aFakeTools} = require('../sendMessage/builders')

describe('Chat WS handler', () => {

    const alice = {user: {username: 'alice'}, clientId: 'c1', subscriptionId: 's1'}
    const aliceTargeted = {username: 'alice', clientId: 'c1', subscriptionId: 's1'}

    function aNoopBus() {
        return {publish: () => {}}
    }

    function aPassThroughTracer() {
        return {span$: (_name, _attrs, work$) => work$}
    }

    function aHandler({replies = [{text: 'Hi there!'}], conversationIds = ['conv-1']} = {}) {
        let i = 0
        const createId = () => conversationIds[Math.min(i++, conversationIds.length - 1)]
        const llm = aFakeLlm({replies})
        const tracer = aPassThroughTracer()
        const tools = aFakeTools()
        const clock = {now: () => 1700000000000}
        const cache = new Map()
        const userChatFor = username => {
            if (!cache.has(username)) {
                cache.set(username, createUserChat({
                    conversationsStore: createInMemoryConversationsStore(),
                    clock,
                    newConversation: () => createConversation({
                        llm, tracer, tools,
                        history: aFakeHistory(),
                        systemPrompt: null,
                        id: createId()
                    })
                }))
            }
            return cache.get(username)
        }
        return createWsHandler({bus: aNoopBus(), userChatFor})
    }

    const ISO_FIXED = new Date(1700000000000).toISOString()
    const META = {title: '', createdAt: ISO_FIXED, updatedAt: ISO_FIXED}

    function captureSent(onConnection) {
        const arg$ = new Subject()
        const sent = []
        onConnection({arg$}).subscribe(message => sent.push(message))
        return {arg$, sent}
    }

    describe('create-conversation', () => {

        it('emits conversation-created targeted to the originator and conversation-claimed as broadcast-except', () => {
            const {arg$, sent} = captureSent(aHandler())

            arg$.next({event: 'subscriptionUp', ...alice})
            arg$.next({data: {type: 'create-conversation'}, ...alice})

            expect(sent.filter(m => m.data?.type === 'conversation-created')).toEqual([{
                ...aliceTargeted,
                data: {type: 'conversation-created', conversationId: 'conv-1', ...META}
            }])
            expect(sent.filter(m => m.data?.type === 'conversation-claimed')).toEqual([{
                username: 'alice',
                excludeClientId: 'c1',
                data: {type: 'conversation-claimed', conversationId: 'conv-1', ...META}
            }])
        })
    })

    describe('message', () => {

        it('emits chat-response as a broadcast (no clientId, no subscriptionId)', () => {
            const {arg$, sent} = captureSent(aHandler())

            arg$.next({event: 'subscriptionUp', ...alice})
            arg$.next({data: {type: 'create-conversation'}, ...alice})
            arg$.next({data: {type: 'message', conversationId: 'conv-1', text: 'Hello'}, ...alice})

            expect(sent.filter(m => m.data?.type === 'chat-response')).toEqual([
                {username: 'alice', data: {type: 'chat-response', conversationId: 'conv-1', text: 'Hi there!'}},
                {username: 'alice', data: {type: 'chat-response', conversationId: 'conv-1', complete: true}}
            ])
        })

        it('uses the supplied conversationId instead of server-side active selection', () => {
            const {arg$, sent} = captureSent(aHandler({
                replies: [{text: 'First reply'}, {text: 'Second reply'}],
                conversationIds: ['conv-1', 'conv-2']
            }))

            arg$.next({event: 'subscriptionUp', ...alice})
            arg$.next({data: {type: 'create-conversation'}, ...alice})
            arg$.next({data: {type: 'create-conversation'}, ...alice})
            arg$.next({data: {type: 'message', conversationId: 'conv-1', text: 'Hello'}, ...alice})

            expect(sent.filter(m => m.data?.type === 'chat-response')).toEqual([
                {username: 'alice', data: {type: 'chat-response', conversationId: 'conv-1', text: 'First reply'}},
                {username: 'alice', data: {type: 'chat-response', conversationId: 'conv-1', complete: true}}
            ])
        })

        it('drops messages that arrive before a conversation is created', () => {
            const {arg$, sent} = captureSent(aHandler())

            arg$.next({event: 'subscriptionUp', ...alice})
            arg$.next({data: {type: 'message', conversationId: 'conv-1', text: 'Hello'}, ...alice})

            expect(sent.filter(m => m.data?.type === 'chat-response')).toEqual([])
        })

        it('drops messages that arrive after subscriptionDown', () => {
            const {arg$, sent} = captureSent(aHandler())

            arg$.next({event: 'subscriptionUp', ...alice})
            arg$.next({data: {type: 'create-conversation'}, ...alice})
            arg$.next({event: 'subscriptionDown', ...alice})
            arg$.next({data: {type: 'message', conversationId: 'conv-1', text: 'Hello'}, ...alice})

            expect(sent.filter(m => m.data?.type === 'chat-response')).toEqual([])
        })
    })

    describe('select-conversation', () => {

        it('emits conversation-loaded targeted to the requester with the messages', () => {
            const {arg$, sent} = captureSent(aHandler({
                replies: [{text: 'A1'}], conversationIds: ['conv-1', 'conv-2']
            }))

            arg$.next({event: 'subscriptionUp', ...alice})
            arg$.next({data: {type: 'create-conversation'}, ...alice})
            arg$.next({data: {type: 'message', conversationId: 'conv-1', text: 'first'}, ...alice})
            arg$.next({data: {type: 'create-conversation'}, ...alice})
            arg$.next({data: {type: 'select-conversation', conversationId: 'conv-1'}, ...alice})

            expect(sent.filter(m => m.data?.type === 'conversation-loaded')).toEqual([{
                ...aliceTargeted,
                data: {
                    type: 'conversation-loaded',
                    conversationId: 'conv-1',
                    messages: [
                        {role: 'user', content: 'first'},
                        {role: 'assistant', content: 'A1'}
                    ]
                }
            }])
        })
    })

    describe('list-conversations', () => {

        it('emits conversations targeted to the requester', () => {
            const {arg$, sent} = captureSent(aHandler({conversationIds: ['conv-1', 'conv-2']}))

            arg$.next({event: 'subscriptionUp', ...alice})
            arg$.next({data: {type: 'create-conversation'}, ...alice})
            arg$.next({data: {type: 'create-conversation'}, ...alice})
            arg$.next({data: {type: 'list-conversations'}, ...alice})

            expect(sent.filter(m => m.data?.type === 'conversations')).toEqual([{
                ...aliceTargeted,
                data: {
                    type: 'conversations',
                    conversations: [{id: 'conv-1', ...META}, {id: 'conv-2', ...META}]
                }
            }])
        })
    })

    describe('lock-cycle (status + user-message + abort)', () => {

        it('emits status (broadcast) and user-message (broadcast-except) when a message arrives', () => {
            const {arg$, sent} = captureSent(aHandler())

            arg$.next({event: 'subscriptionUp', ...alice})
            arg$.next({data: {type: 'create-conversation'}, ...alice})
            arg$.next({data: {type: 'message', conversationId: 'conv-1', text: 'Hello'}, ...alice})

            expect(sent.filter(m => m.data?.type === 'status')).toEqual([{
                username: 'alice',
                data: {type: 'status', conversationId: 'conv-1'}
            }])
            expect(sent.filter(m => m.data?.type === 'user-message')).toEqual([{
                username: 'alice',
                excludeClientId: 'c1',
                data: {type: 'user-message', conversationId: 'conv-1', text: 'Hello'}
            }])
        })

        it('routes abort through to a chat-response complete broadcast', () => {
            const {arg$, sent} = captureSent(aHandler())

            arg$.next({event: 'subscriptionUp', ...alice})
            arg$.next({data: {type: 'create-conversation'}, ...alice})
            arg$.next({data: {type: 'message', conversationId: 'conv-1', text: 'Hello'}, ...alice})
            arg$.next({data: {type: 'abort', conversationId: 'conv-1'}, ...alice})

            const completes = sent
                .filter(m => m.data?.type === 'chat-response' && m.data?.complete)
            expect(completes.length).toBeGreaterThanOrEqual(1)
            expect(completes[completes.length - 1]).toEqual({
                username: 'alice',
                data: {type: 'chat-response', conversationId: 'conv-1', complete: true}
            })
        })
    })

    describe('delete-conversation', () => {

        it('emits conversation-deleted as a broadcast', () => {
            const {arg$, sent} = captureSent(aHandler())

            arg$.next({event: 'subscriptionUp', ...alice})
            arg$.next({data: {type: 'create-conversation'}, ...alice})
            arg$.next({data: {type: 'delete-conversation', conversationId: 'conv-1'}, ...alice})

            expect(sent.filter(m => m.data?.type === 'conversation-deleted')).toEqual([{
                username: 'alice',
                data: {type: 'conversation-deleted', conversationId: 'conv-1'}
            }])
        })
    })

    describe('delete-all-conversations', () => {

        it('emits conversation-deleted as a broadcast for each conversation', () => {
            const {arg$, sent} = captureSent(aHandler({conversationIds: ['conv-1', 'conv-2']}))

            arg$.next({event: 'subscriptionUp', ...alice})
            arg$.next({data: {type: 'create-conversation'}, ...alice})
            arg$.next({data: {type: 'create-conversation'}, ...alice})
            arg$.next({data: {type: 'delete-all-conversations'}, ...alice})

            expect(sent.filter(m => m.data?.type === 'conversation-deleted')).toEqual([
                {username: 'alice', data: {type: 'conversation-deleted', conversationId: 'conv-1'}},
                {username: 'alice', data: {type: 'conversation-deleted', conversationId: 'conv-2'}}
            ])
        })
    })
})
