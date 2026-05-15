const {of} = require('rxjs')
const {createToolRegistry} = require('#mcp/chat/tools/registry')
const {aFakeBus, read} = require('../builders')

describe('tool registry — result diagnostics', () => {

    const echoTool = {
        name: 'echo',
        description: 'Echo input text.',
        parameters: {
            type: 'object',
            properties: {text: {type: 'string'}},
            required: ['text'],
            additionalProperties: false
        },
        invoke$: input => of({echoed: input.text})
    }

    let bus
    beforeEach(() => {
        bus = aFakeBus()
    })

    it('publishes a debug tool-result event with the result kind for a successful object result, and a trace payload', () => {
        const registry = createToolRegistry({tools: [echoTool], bus})

        read(registry.invoke$({id: 'c1', name: 'echo', input: {text: 'hi'}}, {conversationId: 'conv-1'}))

        expect(debugEvents(bus.published)).toEqual([{
            type: 'tool.result',
            level: 'debug',
            message: 'tool echo -> ok kind=object',
            conversationId: 'conv-1',
            toolName: 'echo',
            ok: true,
            kind: 'object'
        }])
        expect(traceEvents(bus.published)[0]).toMatchObject({
            type: 'tool.resultPayload',
            level: 'trace',
            conversationId: 'conv-1',
            toolName: 'echo'
        })
    })

    it('reports count, first-item keys, and named-item count for an array result', () => {
        const listTool = {
            name: 'recipe_list',
            description: 'x',
            parameters: {type: 'object', properties: {}, additionalProperties: true},
            invoke$: () => of([
                {id: 'r1', type: 'MOSAIC', name: 'Kenya'},
                {id: 'r2', type: 'MOSAIC', name: 'Sudan'},
                {id: 'r3', type: 'MOSAIC'}
            ])
        }
        const registry = createToolRegistry({tools: [listTool], bus})

        read(registry.invoke$({id: 'c1', name: 'recipe_list', input: {}}, {conversationId: 'conv-1'}))

        expect(debugEvents(bus.published)[0]).toMatchObject({
            message: 'tool recipe_list -> ok kind=array count=3 named=2',
            ok: true,
            kind: 'array',
            count: 3,
            firstItemKeys: ['id', 'type', 'name'],
            namedCount: 2
        })
    })

    it('reports the error code for a failed tool', () => {
        const registry = createToolRegistry({tools: [echoTool], bus})

        read(registry.invoke$({id: 'c1', name: 'missing', input: {}}, {conversationId: 'conv-1'}))

        expect(debugEvents(bus.published)[0]).toMatchObject({
            type: 'tool.result',
            level: 'debug',
            message: 'tool missing -> failed code=UNKNOWN_TOOL',
            conversationId: 'conv-1',
            toolName: 'missing',
            ok: false,
            errorCode: 'UNKNOWN_TOOL'
        })
    })
})

function debugEvents(events) {
    return events.filter(event => event.level === 'debug')
}

function traceEvents(events) {
    return events.filter(event => event.level === 'trace')
}
