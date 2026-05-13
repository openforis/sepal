const {Subject, of, throwError} = require('rxjs')
const {createWsHandler} = require('#mcp/chat/io/wsHandler')
const {createConversation} = require('#mcp/chat/sendMessage/conversation')
const {createUserChat} = require('#mcp/chat/sendMessage/userChat')
const {createInMemoryConversationsStore} = require('./inMemoryConversationsStore')
const {aFakeHistory, aFakeLlm, aFakeTools, aFakeTitleGenerator} = require('../sendMessage/builders')

describe('Chat WS handler', () => {

    const alice = {user: {username: 'alice'}, clientId: 'c1', subscriptionId: 's1'}
    const aliceTargeted = {username: 'alice', clientId: 'c1', subscriptionId: 's1'}

    function aNoopBus() {
        return {publish: () => {}}
    }

    function aPassThroughTracer() {
        return {span$: (_name, _attrs, work$) => work$}
    }

    function aHandler({replies = [{text: 'Hi there!'}], conversationIds = ['conv-1'], bus = aNoopBus()} = {}) {
        let i = 0
        const createId = () => conversationIds[Math.min(i++, conversationIds.length - 1)]
        const llm = aFakeLlm({replies})
        const tracer = aPassThroughTracer()
        const tools = aFakeTools()
        const clock = {
            now: () => 1700000000000,
            nowIso: () => new Date(1700000000000).toISOString()
        }
        const cache = new Map()
        const userChatFor = username => {
            if (!cache.has(username)) {
                cache.set(username, createUserChat({
                    conversationsStore: createInMemoryConversationsStore(),
                    clock,
                    createId,
                    titleGenerator: aFakeTitleGenerator(),
                    conversationFor$: id => of(createConversation({
                        llm, tracer, tools,
                        history: aFakeHistory(),
                        systemPrompt: null,
                        id
                    }))
                }))
            }
            return cache.get(username)
        }
        return createWsHandler({bus, userChatFor})
    }

    const ISO_FIXED = new Date(1700000000000).toISOString()
    const META = {title: '', createdAt: ISO_FIXED, updatedAt: ISO_FIXED}

    function captureSent(onConnection) {
        const arg$ = new Subject()
        const sent = []
        onConnection({arg$}).subscribe(message => sent.push(message))
        return {arg$, sent}
    }

    describe('subscriptionUp', () => {

        it('pushes the user\'s conversation list to the new subscription so the tab can populate on connect', () => {
            const {arg$, sent} = captureSent(aHandler())

            arg$.next({event: 'subscriptionUp', ...alice})

            expect(sent.filter(m => m.data?.type === 'conversations')).toEqual([{
                ...aliceTargeted,
                data: {type: 'conversations', conversations: []}
            }])
        })
    })

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
            arg$.next({data: {type: 'message', conversationId: 'conv-1', text: 'hi'}, ...alice})
            arg$.next({data: {type: 'create-conversation'}, ...alice})
            arg$.next({data: {type: 'message', conversationId: 'conv-2', text: 'hi'}, ...alice})
            arg$.next({data: {type: 'list-conversations'}, ...alice})

            const conversationsEvents = sent.filter(m => m.data?.type === 'conversations')
            expect(conversationsEvents.at(-1)).toEqual({
                ...aliceTargeted,
                data: {
                    type: 'conversations',
                    conversations: [{id: 'conv-1', ...META}, {id: 'conv-2', ...META}]
                }
            })
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

    describe('publishes ignored messages at trace', () => {
        let arg$, published

        beforeEach(() => {
            published = []
            const bus = {publish: e => published.push(e)}
            arg$ = new Subject()
            aHandler({bus})({arg$}).subscribe()
        })

        it('heartbeat', () => {
            arg$.next({hb: 12345})

            expect(published[0]).toMatchObject({
                type: 'wsIn', kind: 'ignored', level: 'trace',
                reason: 'heartbeat', message: 'WS in heartbeat'
            })
        })

        it('gateway lifecycle events (userUp, clientUp, clientDown)', () => {
            arg$.next({event: 'userUp', user: {username: 'alice'}})
            arg$.next({event: 'clientUp', user: {username: 'alice'}, clientId: 'c1'})

            expect(published).toHaveLength(2)
            expect(published[0]).toMatchObject({
                kind: 'ignored', level: 'trace',
                reason: 'gatewayEvent', event: 'userUp'
            })
            expect(published[1]).toMatchObject({
                kind: 'ignored', level: 'trace',
                reason: 'gatewayEvent', event: 'clientUp'
            })
        })

        it('empty messages — no event, no data', () => {
            arg$.next({user: {username: 'alice'}})

            expect(published[0]).toMatchObject({
                kind: 'ignored', level: 'trace', reason: 'empty'
            })
        })
    })

    describe('publishes a self-describing wsIn event', () => {
        const aliceLabel = 'c1:s1 (alice)'
        let arg$, published

        beforeEach(() => {
            published = []
            const bus = {publish: e => published.push(e)}
            arg$ = new Subject()
            aHandler({bus, conversationIds: ['conv-9']})({arg$}).subscribe()
        })

        it('subscriptionUp', () => {
            arg$.next({event: 'subscriptionUp', ...alice})

            expect(published[0]).toMatchObject({
                type: 'wsIn', kind: 'subscriptionUp', ...aliceTargeted,
                level: 'info', message: `WS in ${aliceLabel} subscriptionUp`
            })
        })

        it('subscriptionDown', () => {
            arg$.next({event: 'subscriptionUp', ...alice})
            published.length = 0
            arg$.next({event: 'subscriptionDown', ...alice})

            expect(published[0]).toMatchObject({
                kind: 'subscriptionDown', level: 'info',
                message: `WS in ${aliceLabel} subscriptionDown`
            })
        })

        it('create-conversation', () => {
            arg$.next({event: 'subscriptionUp', ...alice})
            published.length = 0
            arg$.next({data: {type: 'create-conversation'}, ...alice})

            expect(published[0]).toMatchObject({
                kind: 'create-conversation', level: 'info',
                message: `WS in ${aliceLabel} create-conversation`
            })
        })

        it('select-conversation with the conversationId', () => {
            arg$.next({event: 'subscriptionUp', ...alice})
            published.length = 0
            arg$.next({data: {type: 'select-conversation', conversationId: 'conv-9'}, ...alice})

            expect(published[0]).toMatchObject({
                kind: 'select-conversation', conversationId: 'conv-9',
                level: 'info', message: `WS in ${aliceLabel} select-conversation conv-9`
            })
        })

        it('delete-conversation with the conversationId', () => {
            arg$.next({event: 'subscriptionUp', ...alice})
            published.length = 0
            arg$.next({data: {type: 'delete-conversation', conversationId: 'conv-9'}, ...alice})

            expect(published[0]).toMatchObject({
                kind: 'delete-conversation', conversationId: 'conv-9',
                level: 'info', message: `WS in ${aliceLabel} delete-conversation conv-9`
            })
        })

        it('delete-all-conversations', () => {
            arg$.next({event: 'subscriptionUp', ...alice})
            published.length = 0
            arg$.next({data: {type: 'delete-all-conversations'}, ...alice})

            expect(published[0]).toMatchObject({
                kind: 'delete-all-conversations', level: 'info',
                message: `WS in ${aliceLabel} delete-all-conversations`
            })
        })

        it('list-conversations', () => {
            arg$.next({event: 'subscriptionUp', ...alice})
            published.length = 0
            arg$.next({data: {type: 'list-conversations'}, ...alice})

            expect(published[0]).toMatchObject({
                kind: 'list-conversations', level: 'info',
                message: `WS in ${aliceLabel} list-conversations`
            })
        })

        it('abort with the conversationId', () => {
            arg$.next({event: 'subscriptionUp', ...alice})
            published.length = 0
            arg$.next({data: {type: 'abort', conversationId: 'conv-9'}, ...alice})

            expect(published[0]).toMatchObject({
                kind: 'abort', conversationId: 'conv-9',
                level: 'info', message: `WS in ${aliceLabel} abort conv-9`
            })
        })

        it('message with the conversationId and text', () => {
            arg$.next({event: 'subscriptionUp', ...alice})
            published.length = 0
            arg$.next({data: {type: 'message', conversationId: 'conv-9', text: 'Hello'}, ...alice})

            expect(published[0]).toMatchObject({
                kind: 'message', conversationId: 'conv-9', text: 'Hello',
                level: 'info', message: `WS in ${aliceLabel} message conv-9: "Hello"`
            })
        })

        it('context at debug (recognised, fires on every GUI selection change)', () => {
            arg$.next({event: 'subscriptionUp', ...alice})
            published.length = 0
            arg$.next({data: {type: 'context', selection: {section: 'process'}}, ...alice})

            expect(published[0]).toMatchObject({
                kind: 'context', level: 'debug',
                message: `WS in ${aliceLabel} context`
            })
        })

        it('unknown data type at warn level', () => {
            arg$.next({event: 'subscriptionUp', ...alice})
            published.length = 0
            arg$.next({data: {type: 'something-else'}, ...alice})

            expect(published[0]).toMatchObject({
                kind: 'unknown', dataType: 'something-else',
                level: 'warn', message: `WS in ${aliceLabel} unknown data type: something-else (ignored)`
            })
        })
    })

    describe('error reporting', () => {

        it('publishes wsConnectionError when the inbound stream errors', () => {
            const published = []
            const bus = {publish: e => published.push(e)}
            const arg$ = new Subject()
            aHandler({bus})({arg$}).subscribe()

            arg$.error(new Error('socket closed badly'))

            expect(published.at(-1)).toMatchObject({
                type: 'wsConnectionError',
                level: 'error',
                message: 'WS connection errored: socket closed badly'
            })
        })

        it('publishes wsRouteError when routing a message throws', () => {
            const published = []
            const bus = {publish: e => published.push(e)}
            const handler = createWsHandler({
                bus,
                userChatFor: () => {
                    throw new Error('user chat unavailable')
                }
            })
            const arg$ = new Subject()
            handler({arg$}).subscribe()

            arg$.next({event: 'subscriptionUp', ...alice})

            expect(published.at(-1)).toMatchObject({
                type: 'wsRouteError',
                level: 'error',
                message: 'WS handler threw on message: user chat unavailable'
            })
        })

        it('publishes workFailed when dispatched command work errors', () => {
            const published = []
            const bus = {publish: e => published.push(e)}
            const userChat = {
                listConversations$: () => of(undefined),
                sendUserMessage$: () => throwError(() => new Error('redis unavailable'))
            }
            const handler = createWsHandler({bus, userChatFor: () => userChat})
            const arg$ = new Subject()
            handler({arg$}).subscribe()

            arg$.next({event: 'subscriptionUp', ...alice})
            arg$.next({data: {type: 'message', conversationId: 'conv-1', text: 'hello'}, ...alice})

            expect(published.at(-1)).toMatchObject({
                type: 'workFailed',
                level: 'error',
                message: 'WS work failed: redis unavailable'
            })
        })
    })
})
