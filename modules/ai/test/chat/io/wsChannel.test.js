const {Subject} = require('rxjs')
const {createWsChannel} = require('#mcp/chat/io/wsChannel')

describe('WS channel adapter', () => {

    const alice = {username: 'alice', clientId: 'c1', subscriptionId: 's1'}

    let out$, sent, published, bus, channel

    beforeEach(() => {
        out$ = new Subject()
        sent = []
        out$.subscribe(message => sent.push(message))
        published = []
        bus = {publish: event => published.push(event)}
        channel = createWsChannel({out$, bus, ...alice})
    })

    describe('chatResponse — broadcast to all the user\'s tabs', () => {

        it('emits a text chunk on the wire (textDelta → wire field "text")', () => {
            channel.chatResponse({conversationId: 'conv-1', textDelta: 'Hello'})

            expect(sent).toEqual([{
                username: 'alice',
                data: {type: 'chat-response', conversationId: 'conv-1', text: 'Hello'}
            }])
        })

        it('publishes a debug-level wsOut for text chunks (one per token — too verbose for info)', () => {
            channel.chatResponse({conversationId: 'conv-1', textDelta: 'Hello'})

            expect(published[0]).toMatchObject({
                type: 'wsOut',
                level: 'debug',
                message: 'WS out (alice broadcast) chat-response conv-1 text: "Hello"'
            })
        })

        it('emits complete: true and publishes an info-level wsOut', () => {
            channel.chatResponse({conversationId: 'conv-1', complete: true})

            expect(sent).toEqual([{
                username: 'alice',
                data: {type: 'chat-response', conversationId: 'conv-1', complete: true}
            }])
            expect(published[0]).toMatchObject({
                level: 'debug',
                message: 'WS out (alice broadcast) chat-response conv-1 complete'
            })
        })
    })

    describe('status — broadcast', () => {

        it('emits a status and publishes an info wsOut', () => {
            channel.status('conv-1')

            expect(sent).toEqual([{
                username: 'alice',
                data: {type: 'status', conversationId: 'conv-1'}
            }])
            expect(published[0]).toMatchObject({
                level: 'debug',
                message: 'WS out (alice broadcast) status conv-1'
            })
        })
    })

    describe('userMessage — broadcast except the originator', () => {

        it('emits a user-message excluding the originator clientId', () => {
            channel.userMessage('conv-1', 'hello')

            expect(sent).toEqual([{
                username: 'alice',
                excludeClientId: 'c1',
                data: {type: 'user-message', conversationId: 'conv-1', text: 'hello'}
            }])
            expect(published[0]).toMatchObject({
                level: 'debug',
                message: 'WS out (alice broadcast except c1) user-message conv-1: "hello"'
            })
        })
    })

    describe('conversationCreated — targeted to the originator', () => {

        const meta = {id: 'conv-1', title: '', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z'}

        it('emits the meta record (id flattened to conversationId) routed to clientId + subscriptionId', () => {
            channel.conversationCreated(meta)

            expect(sent).toEqual([{
                ...alice,
                data: {
                    type: 'conversation-created',
                    conversationId: 'conv-1',
                    title: '',
                    createdAt: '2024-01-01T00:00:00Z',
                    updatedAt: '2024-01-01T00:00:00Z'
                }
            }])
            expect(published[0]).toMatchObject({
                level: 'debug',
                message: 'WS out c1:s1 (alice) conversation-created conv-1'
            })
        })
    })

    describe('conversationClaimed — broadcast except originator', () => {

        const meta = {id: 'conv-1', title: '', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z'}

        it('emits the meta record with excludeClientId so other tabs add to their sidebar', () => {
            channel.conversationClaimed(meta)

            expect(sent).toEqual([{
                username: 'alice',
                excludeClientId: 'c1',
                data: {
                    type: 'conversation-claimed',
                    conversationId: 'conv-1',
                    title: '',
                    createdAt: '2024-01-01T00:00:00Z',
                    updatedAt: '2024-01-01T00:00:00Z'
                }
            }])
            expect(published[0]).toMatchObject({
                level: 'debug',
                message: 'WS out (alice broadcast except c1) conversation-claimed conv-1'
            })
        })
    })

    describe('conversationLoaded — targeted to the requester', () => {

        const messages = [{role: 'user', content: 'first'}, {role: 'assistant', content: 'reply'}]

        it('emits routed to clientId + subscriptionId with the messages', () => {
            channel.conversationLoaded('conv-1', messages)

            expect(sent).toEqual([{
                ...alice,
                data: {type: 'conversation-loaded', conversationId: 'conv-1', messages}
            }])
            expect(published[0]).toMatchObject({
                level: 'debug',
                message: 'WS out c1:s1 (alice) conversation-loaded conv-1 (2 messages)'
            })
        })
    })

    describe('conversationDeleted — broadcast', () => {

        it('emits keyed by username only', () => {
            channel.conversationDeleted('conv-1')

            expect(sent).toEqual([{
                username: 'alice',
                data: {type: 'conversation-deleted', conversationId: 'conv-1'}
            }])
            expect(published[0]).toMatchObject({
                level: 'debug',
                message: 'WS out (alice broadcast) conversation-deleted conv-1'
            })
        })
    })

    describe('conversationsList — targeted', () => {

        it('emits to the requester with the ids', () => {
            channel.conversationsList(['conv-1', 'conv-2'])

            expect(sent).toEqual([{
                ...alice,
                data: {type: 'conversations', conversations: ['conv-1', 'conv-2']}
            }])
            expect(published[0]).toMatchObject({
                level: 'debug',
                message: 'WS out c1:s1 (alice) conversations (2)'
            })
        })
    })
})
