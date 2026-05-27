const {publishToolCall} = require('#mcp/chat/conversation/conversationEvents')
const {aFakeBus} = require('../builders')

describe('publishToolCall — orchestrator tool-call diagnostics', () => {

    const diagnostics = {summarizeObject: () => ''}

    function debugEvent(events) {
        return events.find(event => event.type === 'conversation.llmToolCall')
    }

    it('includes recipeId and quoted request for update_recipe', () => {
        const bus = aFakeBus()

        publishToolCall({
            bus, diagnostics, conversationId: 'c1', round: 0,
            toolCall: {id: 't1', name: 'update_recipe', input: {recipeId: 'r1', request: 'speed up rendering'}}
        })

        const event = debugEvent(bus.published)
        expect(event.level).toBe('debug')
        expect(event.toolName).toBe('update_recipe')
        expect(event.inputSummary).toContain('recipeId=r1')
        expect(event.inputSummary).toMatch(/request="speed up rendering"/)
    })

    it('includes context for update_recipe only when present', () => {
        const bus = aFakeBus()

        publishToolCall({
            bus, diagnostics, conversationId: 'c1', round: 0,
            toolCall: {id: 't1', name: 'update_recipe', input: {
                recipeId: 'r1', request: 'speed up rendering',
                context: 'previously lowered scene cloud limit 90 → 75'
            }}
        })

        const event = debugEvent(bus.published)
        expect(event.inputSummary).toMatch(/context="previously lowered scene cloud limit/)
    })

    it('omits context from update_recipe summary when missing or blank', () => {
        const bus = aFakeBus()

        publishToolCall({
            bus, diagnostics, conversationId: 'c1', round: 0,
            toolCall: {id: 't1', name: 'update_recipe', input: {recipeId: 'r1', request: 'fix it', context: '   '}}
        })

        expect(debugEvent(bus.published).inputSummary).not.toMatch(/context=/)
    })

    it('renders request=<missing> when update_recipe was called with neither request nor instruction', () => {
        const bus = aFakeBus()

        publishToolCall({
            bus, diagnostics, conversationId: 'c1', round: 0,
            toolCall: {id: 't1', name: 'update_recipe', input: {recipeId: 'r1'}}
        })

        const summary = debugEvent(bus.published).inputSummary
        expect(summary).toContain('request=<missing>')
        expect(summary).not.toMatch(/request=""/)
    })

    it('falls back to legacy instruction as request for update_recipe', () => {
        const bus = aFakeBus()

        publishToolCall({
            bus, diagnostics, conversationId: 'c1', round: 0,
            toolCall: {id: 't1', name: 'update_recipe', input: {recipeId: 'r1', instruction: 'legacy ask'}}
        })

        expect(debugEvent(bus.published).inputSummary).toMatch(/request="legacy ask"/)
    })

    it('exposes recipeId for describe_recipe so wrong routing is visible at debug', () => {
        const bus = aFakeBus()

        publishToolCall({
            bus, diagnostics, conversationId: 'c1', round: 0,
            toolCall: {id: 't1', name: 'describe_recipe', input: {recipeId: 'r1'}}
        })

        const event = debugEvent(bus.published)
        expect(event.toolName).toBe('describe_recipe')
        expect(event.inputSummary).toContain('recipeId=r1')
    })

    it('includes the optional question on describe_recipe when present', () => {
        const bus = aFakeBus()

        publishToolCall({
            bus, diagnostics, conversationId: 'c1', round: 0,
            toolCall: {id: 't1', name: 'describe_recipe', input: {recipeId: 'r1', question: 'why might it be slow?'}}
        })

        expect(debugEvent(bus.published).inputSummary).toMatch(/question="why might it be slow\?"/)
    })

    it('exposes recipeType and request for create_recipe', () => {
        const bus = aFakeBus()

        publishToolCall({
            bus, diagnostics, conversationId: 'c1', round: 0,
            toolCall: {id: 't1', name: 'create_recipe', input: {recipeType: 'MOSAIC', instruction: 'cloud-masked yearly Albania mosaic'}}
        })

        const event = debugEvent(bus.published)
        expect(event.inputSummary).toContain('recipeType=MOSAIC')
        expect(event.inputSummary).toMatch(/request="cloud-masked yearly Albania mosaic"/)
    })

    it('falls back to inputKeys list for unrecognised tools', () => {
        const bus = aFakeBus()

        publishToolCall({
            bus, diagnostics, conversationId: 'c1', round: 0,
            toolCall: {id: 't1', name: 'map_set_camera', input: {lat: 42, lng: 19, zoom: 8}}
        })

        expect(debugEvent(bus.published).inputSummary).toBe('inputKeys=[lat,lng,zoom]')
    })

    it('truncates long request and context to a bounded length', () => {
        const bus = aFakeBus()
        const longText = 'x'.repeat(500)

        publishToolCall({
            bus, diagnostics, conversationId: 'c1', round: 0,
            toolCall: {id: 't1', name: 'update_recipe', input: {recipeId: 'r1', request: longText, context: longText}}
        })

        const summary = debugEvent(bus.published).inputSummary
        const requestMatch = summary.match(/request="([^"]*?)\.\.\."?/)
        expect(requestMatch).not.toBeNull()
        expect(requestMatch[1].length).toBeLessThan(longText.length)
        expect(summary).toMatch(/context=".*\.\.\."/)
    })

    it('keeps the trace-level payload event separate from the debug summary', () => {
        const bus = aFakeBus()

        publishToolCall({
            bus, diagnostics, conversationId: 'c1', round: 0,
            toolCall: {id: 't1', name: 'update_recipe', input: {recipeId: 'r1', request: 'fix it'}}
        })

        const debug = bus.published.find(event => event.type === 'conversation.llmToolCall')
        const payload = bus.published.find(event => event.type === 'conversation.llmToolCallPayload')
        expect(debug.level).toBe('debug')
        expect(payload.level).toBe('trace')
    })
})
