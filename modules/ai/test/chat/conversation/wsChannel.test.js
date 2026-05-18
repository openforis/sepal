const {Subject} = require('rxjs')
const {createWsChannel} = require('#mcp/chat/conversation/wsChannel')
const {
    assistantNotice, chatResponseComplete, chatResponseDelta,
    conversationClaimed, conversationCreated, conversationDeleted, conversationLoaded,
    conversationUpdated, conversationsList, guiAction, status, toolEnd, toolStart, userMessage
} = require('#mcp/chat/channelEvents')

describe('WS channel adapter — dispatch', () => {

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

    describe('chat-response — broadcast to all the user\'s tabs', () => {

        it('emits a text chunk on the wire (text payload)', () => {
            channel.dispatch(chatResponseDelta('conv-1', 'Hello'))

            expect(sent).toEqual([{
                username: 'alice',
                data: {type: 'chat-response', conversationId: 'conv-1', text: 'Hello'}
            }])
        })

        it('publishes a debug-level wsOut for text chunks (one per token — too verbose for info)', () => {
            channel.dispatch(chatResponseDelta('conv-1', 'Hello'))

            expect(published[0]).toMatchObject({
                type: 'wsOut',
                level: 'debug',
                message: 'WS out (alice broadcast) chat-response conv-1 text: "Hello"'
            })
        })

        it('emits complete: true and publishes an info-level wsOut', () => {
            channel.dispatch(chatResponseComplete('conv-1'))

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

        it('emits a status and publishes a debug wsOut', () => {
            channel.dispatch(status('conv-1'))

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

    describe('user-message — broadcast except the originator', () => {

        it('emits a user-message excluding the originator clientId', () => {
            channel.dispatch(userMessage('conv-1', 'hello'))

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

    describe('conversation-created — targeted to the originator', () => {

        const meta = {id: 'conv-1', title: '', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z'}

        it('emits the meta record (id flattened to conversationId) routed to clientId + subscriptionId', () => {
            channel.dispatch(conversationCreated(meta))

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

    describe('conversation-claimed — broadcast except originator', () => {

        const meta = {id: 'conv-1', title: '', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z'}

        it('emits the meta record with excludeClientId so other tabs add to their sidebar', () => {
            channel.dispatch(conversationClaimed(meta))

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

    describe('conversation-updated — broadcast to all tabs (e.g., title changes)', () => {

        const meta = {id: 'conv-1', title: 'NDVI change Kenya'}

        it('emits the meta record so every tab merges the update into its sidebar', () => {
            channel.dispatch(conversationUpdated(meta))

            expect(sent).toEqual([{
                username: 'alice',
                data: {
                    type: 'conversation-updated',
                    conversationId: 'conv-1',
                    title: 'NDVI change Kenya'
                }
            }])
            expect(published[0]).toMatchObject({
                level: 'debug',
                message: 'WS out (alice broadcast) conversation-updated conv-1'
            })
        })
    })

    describe('conversation-loaded — targeted to the requester', () => {

        const messages = [{role: 'user', content: 'first'}, {role: 'assistant', content: 'reply'}]

        it('emits routed to clientId + subscriptionId with the messages', () => {
            channel.dispatch(conversationLoaded('conv-1', messages))

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

    describe('conversation-deleted — broadcast', () => {

        it('emits keyed by username only', () => {
            channel.dispatch(conversationDeleted('conv-1'))

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

    describe('conversations — targeted', () => {

        it('emits to the requester with the ids', () => {
            channel.dispatch(conversationsList(['conv-1', 'conv-2']))

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

    describe('gui-action — targeted to the requesting tab', () => {

        it('emits a gui-action routed to clientId + subscriptionId so only that tab runs it', () => {
            channel.dispatch(guiAction({requestId: 'req-1', action: 'echo', params: {text: 'hi'}}))

            expect(sent).toEqual([{
                ...alice,
                data: {type: 'gui-action', requestId: 'req-1', action: 'echo', params: {text: 'hi'}}
            }])
            expect(published[0]).toMatchObject({
                level: 'debug',
                message: 'WS out c1:s1 (alice) gui-action echo (req-1)'
            })
        })
    })

    describe('tool-start / tool-end — broadcast to all the user\'s tabs', () => {

        it('emits a tool-start carrying the tool input for live display', () => {
            channel.dispatch(toolStart({conversationId: 'conv-1', toolCallId: 't1', toolName: 'echo', input: {text: 'hi'}}))

            expect(sent).toEqual([{
                username: 'alice',
                data: {type: 'tool-start', conversationId: 'conv-1', toolCallId: 't1', toolName: 'echo', input: {text: 'hi'}}
            }])
            expect(published[0]).toMatchObject({
                level: 'debug',
                message: 'WS out (alice broadcast) tool-start echo conv-1'
            })
        })

        it('emits a tool-end carrying the ok flag and result data for live display', () => {
            channel.dispatch(toolEnd({conversationId: 'conv-1', toolCallId: 't1', toolName: 'echo', ok: true, data: {echoed: 'hi'}}))

            expect(sent).toEqual([{
                username: 'alice',
                data: {type: 'tool-end', conversationId: 'conv-1', toolCallId: 't1', toolName: 'echo', ok: true, data: {echoed: 'hi'}}
            }])
            expect(published[0]).toMatchObject({
                level: 'debug',
                message: 'WS out (alice broadcast) tool-end echo conv-1 ok=true'
            })
        })

        it('emits a tool-end carrying the error envelope when the tool failed', () => {
            channel.dispatch(toolEnd({
                conversationId: 'conv-1', toolCallId: 't1', toolName: 'echo', ok: false,
                error: {code: 'TOOL_FAILED', message: 'boom'}
            }))

            expect(sent).toEqual([{
                username: 'alice',
                data: {
                    type: 'tool-end', conversationId: 'conv-1', toolCallId: 't1', toolName: 'echo', ok: false,
                    error: {code: 'TOOL_FAILED', message: 'boom'}
                }
            }])
            expect(published[0]).toMatchObject({
                level: 'debug',
                message: 'WS out (alice broadcast) tool-end echo conv-1 ok=false'
            })
        })
    })

    describe('assistant-notice — broadcast to all the user\'s tabs', () => {

        it('emits an assistant-notice carrying content + display descriptor', () => {
            channel.dispatch(assistantNotice({
                conversationId: 'conv-1',
                content: 'Step cap reached.',
                display: {key: 'home.chat.notices.toolRoundCap', args: {max: 8}, fallback: 'Step cap reached.'}
            }))

            expect(sent).toEqual([{
                username: 'alice',
                data: {
                    type: 'assistant-notice',
                    conversationId: 'conv-1',
                    content: 'Step cap reached.',
                    display: {key: 'home.chat.notices.toolRoundCap', args: {max: 8}, fallback: 'Step cap reached.'}
                }
            }])
            expect(published[0]).toMatchObject({
                level: 'debug',
                message: 'WS out (alice broadcast) assistant-notice conv-1 key=home.chat.notices.toolRoundCap'
            })
        })
    })
})
