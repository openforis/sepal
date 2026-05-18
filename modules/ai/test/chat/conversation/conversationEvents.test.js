const {of} = require('rxjs')
const {createConversation} = require('#mcp/chat/conversation/conversation')
const {aConversation, aFakeBus, aFakeDiagnostics, aFakeHistory, aFakeLlm, aFakeTools, run} = require('../builders')

describe('conversation event publishers — bounded by default', () => {

    const userText = 'tell me about my recipes in detail'

    function lazyMessage(event) {
        return typeof event.message === 'function' ? event.message() : event.message
    }

    function eventOfType(bus, type) {
        return bus.published.find(event => event.type === type)
    }

    function eventsOfType(bus, type) {
        return bus.published.filter(event => event.type === type)
    }

    it('publishes conversation.llmMessages with bounded message summary, not raw history JSON', () => {
        const bus = aFakeBus()
        const conversation = aConversation({
            llm: aFakeLlm({replies: [{text: 'ok'}]}),
            bus
        })

        run(conversation.sendUserMessage$(userText))

        const messagesEvent = eventOfType(bus, 'conversation.llmMessages')
        expect(messagesEvent).toBeDefined()
        expect(messagesEvent.level).toBe('trace')
        const rendered = lazyMessage(messagesEvent)
        expect(rendered).toMatch(/contentChars/)
        expect(rendered).not.toContain(userText)
    })

    it('publishes conversation.llmTools with bounded tool summary, not full schemas', () => {
        const bus = aFakeBus()
        const longDescription = 'a long description '.repeat(20)
        const schemas = [{
            name: 'recipe_list',
            description: longDescription,
            parameters: {
                type: 'object',
                properties: {filter: {type: 'string', description: 'verbose filter doc'}}
            }
        }]
        const conversation = aConversation({
            llm: aFakeLlm({replies: [{text: 'ok'}]}),
            tools: aFakeTools({}, schemas),
            bus
        })

        run(conversation.sendUserMessage$('list'))

        const toolsEvent = eventOfType(bus, 'conversation.llmTools')
        const rendered = lazyMessage(toolsEvent)
        expect(rendered).toMatch(/parameterKeys/)
        expect(rendered).not.toContain(longDescription)
        expect(rendered).not.toContain('verbose filter doc')
    })

    it('publishes conversation.llmToolCallPayload as an object shape, not raw input JSON, and keeps the tool name on the event itself', () => {
        const bus = aFakeBus()
        const toolCall = {id: 't1', name: 'recipe_list', input: {secret: 'do-not-leak'}}
        const conversation = aConversation({
            llm: aFakeLlm({replies: [{toolCalls: [toolCall]}, {text: 'done'}]}),
            tools: aFakeTools({recipe_list: () => of([])}),
            bus
        })

        run(conversation.sendUserMessage$('list'))

        const event = eventOfType(bus, 'conversation.llmToolCallPayload')
        const rendered = lazyMessage(event)
        expect(event.toolName).toBe('recipe_list')
        expect(rendered).toMatch(/object\(keys=/)
        expect(rendered).not.toContain('do-not-leak')
    })

    it('publishes conversation.historyProjectionPayload as bounded summaries on each side', () => {
        const bus = aFakeBus()
        const longText = 'sensitive payload that should be summarized away. '.repeat(50)
        const conversation = aConversation({
            llm: aFakeLlm({replies: [{text: 'ack'}, {text: 'ack'}]}),
            bus
        })

        run(conversation.sendUserMessage$(longText))
        run(conversation.sendUserMessage$('second'))

        const projectionEvents = eventsOfType(bus, 'conversation.historyProjectionPayload')
        expect(projectionEvents.length).toBeGreaterThan(0)
        const rendered = lazyMessage(projectionEvents.at(-1))
        expect(rendered).toMatch(/contentChars/)
        expect(rendered).not.toContain('sensitive payload')
    })
})

describe('conversation event publishers — default safety', () => {

    it('renders lazy trace messages when the caller never provided a diagnostics collaborator', () => {
        const bus = aFakeBus()
        const conversation = createConversation({
            id: 'c1',
            llm: aFakeLlm({replies: [{text: 'ok'}]}),
            history: aFakeHistory(),
            tools: aFakeTools(),
            initialMessages: [],
            bus
        })

        run(conversation.sendUserMessage$('hi'))

        const event = bus.published.find(e => e.type === 'conversation.llmMessages')
        expect(event).toBeDefined()
        expect(() => event.message()).not.toThrow()
    })
})

describe('conversation event publishers — full payload opt-in', () => {

    it('emits full JSON in conversation.llmMessages when diagnostics.fullPayloads is true', () => {
        const bus = aFakeBus()
        const diagnostics = aFakeDiagnostics({fullPayloads: true})
        const userText = 'leak me back please'
        const conversation = aConversation({
            llm: aFakeLlm({replies: [{text: 'ok'}]}),
            bus,
            diagnostics
        })

        run(conversation.sendUserMessage$(userText))

        const event = bus.published.find(e => e.type === 'conversation.llmMessages')
        const rendered = typeof event.message === 'function' ? event.message() : event.message
        expect(rendered).toContain(userText)
    })
})

describe('empty-reply diagnostic enrichment', () => {

    const toolCall = {id: 't1', name: 'recipe_list', input: {}}

    it('enriches conversation.llmEmptyReply with a role summary, exposed tools, and last requested tool calls', () => {
        const bus = aFakeBus()
        const schemas = [{name: 'recipe_list', description: 'd', parameters: {type: 'object'}}]
        const llm = aFakeLlm({replies: [
            {toolCalls: [toolCall]},
            {},
            {}
        ]})
        const tools = aFakeTools({recipe_list: () => of([])}, schemas)
        const conversation = aConversation({llm, tools, bus})

        run(conversation.sendUserMessage$('open it'))

        const emptyReply = bus.published.find(e => e.type === 'conversation.llmEmptyReply')
        expect(emptyReply).toMatchObject({
            type: 'conversation.llmEmptyReply',
            level: 'warn',
            afterToolRound: true,
            toolSummary: 'recipe_list:ok:array(0)',
            requestedToolCalls: ['recipe_list']
        })
        expect(emptyReply.roleSummary).toMatch(/assistant\.toolCalls\(recipe_list\)/)
        expect(emptyReply.roleSummary).toMatch(/tool\(recipe_list:ok:array\(0\)\)/)
        expect(emptyReply.exposedTools).toEqual([])
    })

    it('enriches conversation.llmEmptyRetry with the role summary and exposed tool surface', () => {
        const bus = aFakeBus()
        const schemas = [{name: 'recipe_list', description: 'd', parameters: {type: 'object'}}]
        const llm = aFakeLlm({replies: [
            {toolCalls: [toolCall]},
            {},
            {text: 'No tool here can do that.'}
        ]})
        const tools = aFakeTools({recipe_list: () => of([])}, schemas)
        const conversation = aConversation({llm, tools, bus})

        run(conversation.sendUserMessage$('open it'))

        const retry = bus.published.find(e => e.type === 'conversation.llmEmptyRetry')
        expect(retry).toMatchObject({
            type: 'conversation.llmEmptyRetry',
            level: 'info',
            afterToolRound: true,
            exposedTools: ['recipe_list']
        })
        expect(retry.roleSummary).toMatch(/assistant\.toolCalls\(recipe_list\)/)
    })
})
