const {of, throwError} = require('rxjs')
const {createToolRegistry} = require('#mcp/chat/sendMessage/tools')
const {aFakeBus, read} = require('./builders')

describe('tool registry', () => {

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

    describe('schemas', () => {

        it('exposes each tool as a provider-agnostic name/description/parameters schema', () => {
            const registry = createToolRegistry({tools: [echoTool], bus})

            expect(registry.schemas()).toEqual([{
                name: 'echo',
                description: 'Echo input text.',
                parameters: echoTool.parameters
            }])
        })
    })

    describe('invoke$', () => {

        it('wraps a tool result in a success envelope', () => {
            const registry = createToolRegistry({tools: [echoTool], bus})

            const result = read(registry.invoke$({id: 'c1', name: 'echo', input: {text: 'hi'}}))

            expect(result).toEqual({ok: true, data: {echoed: 'hi'}})
        })

        it('passes the turn context through to the tool', () => {
            const seen = []
            const contextTool = {
                name: 'context_tool',
                description: 'x',
                parameters: {type: 'object', properties: {}, additionalProperties: true},
                invoke$: (_input, context) => {
                    seen.push(context)
                    return of('ok')
                }
            }
            const registry = createToolRegistry({tools: [contextTool], bus})
            const context = {conversationId: 'conv-1', channel: {}}

            read(registry.invoke$({id: 'c1', name: 'context_tool', input: {}}, context))

            expect(seen).toEqual([context])
        })

        it('returns an UNKNOWN_TOOL envelope for a tool that is not registered', () => {
            const registry = createToolRegistry({tools: [echoTool], bus})

            const result = read(registry.invoke$({id: 'c1', name: 'missing', input: {}}))

            expect(result).toEqual({
                ok: false,
                error: {code: 'UNKNOWN_TOOL', message: 'Tool not found: missing'}
            })
        })

        it('returns a TOOL_FAILED envelope when the tool throws', () => {
            const failingTool = {
                name: 'failing',
                description: 'x',
                parameters: {type: 'object', properties: {}, additionalProperties: true},
                invoke$: () => throwError(() => new Error('database unreachable'))
            }
            const registry = createToolRegistry({tools: [failingTool], bus})

            const result = read(registry.invoke$({id: 'c1', name: 'failing', input: {}}))

            expect(result).toEqual({
                ok: false,
                error: {code: 'TOOL_FAILED', message: 'database unreachable'}
            })
        })

        it('returns an INVALID_TOOL_ARGS envelope when the input fails the tool schema', () => {
            const registry = createToolRegistry({tools: [echoTool], bus})

            const result = read(registry.invoke$({id: 'c1', name: 'echo', input: {}}))

            expect(result.ok).toBe(false)
            expect(result.error.code).toBe('INVALID_TOOL_ARGS')
            expect(result.error.details).toBeDefined()
        })

        it('returns an INVALID_TOOL_ARGS envelope when the adapter could not parse the arguments', () => {
            const registry = createToolRegistry({tools: [echoTool], bus})

            const result = read(registry.invoke$({
                id: 'c1', name: 'echo', input: null, argsError: 'Unexpected token } in JSON'
            }))

            expect(result.ok).toBe(false)
            expect(result.error.code).toBe('INVALID_TOOL_ARGS')
            expect(result.error.message).toContain('Unexpected token')
        })

        it('does not invoke the tool when the arguments are invalid', () => {
            let invoked = false
            const guardedTool = {
                ...echoTool,
                invoke$: input => {
                    invoked = true
                    return of({echoed: input.text})
                }
            }
            const registry = createToolRegistry({tools: [guardedTool], bus})

            read(registry.invoke$({id: 'c1', name: 'echo', input: {}}))

            expect(invoked).toBe(false)
        })
    })

    describe('result diagnostics', () => {

        it('publishes a debug tool-result event with the result kind for a successful object result', () => {
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
})

function debugEvents(events) {
    return events.filter(event => event.level === 'debug')
}

function traceEvents(events) {
    return events.filter(event => event.level === 'trace')
}
