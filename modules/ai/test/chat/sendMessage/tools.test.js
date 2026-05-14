const {of, throwError} = require('rxjs')
const {createToolRegistry} = require('#mcp/chat/sendMessage/tools')
const {read} = require('./builders')

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

    describe('schemas', () => {

        it('exposes each tool as a provider-agnostic name/description/parameters schema', () => {
            const registry = createToolRegistry({tools: [echoTool]})

            expect(registry.schemas()).toEqual([{
                name: 'echo',
                description: 'Echo input text.',
                parameters: echoTool.parameters
            }])
        })
    })

    describe('invoke$', () => {

        it('wraps a tool result in a success envelope', () => {
            const registry = createToolRegistry({tools: [echoTool]})

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
            const registry = createToolRegistry({tools: [contextTool]})
            const context = {conversationId: 'conv-1', channel: {}}

            read(registry.invoke$({id: 'c1', name: 'context_tool', input: {}}, context))

            expect(seen).toEqual([context])
        })

        it('returns an UNKNOWN_TOOL envelope for a tool that is not registered', () => {
            const registry = createToolRegistry({tools: [echoTool]})

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
            const registry = createToolRegistry({tools: [failingTool]})

            const result = read(registry.invoke$({id: 'c1', name: 'failing', input: {}}))

            expect(result).toEqual({
                ok: false,
                error: {code: 'TOOL_FAILED', message: 'database unreachable'}
            })
        })

        it('returns an INVALID_TOOL_ARGS envelope when the input fails the tool schema', () => {
            const registry = createToolRegistry({tools: [echoTool]})

            const result = read(registry.invoke$({id: 'c1', name: 'echo', input: {}}))

            expect(result.ok).toBe(false)
            expect(result.error.code).toBe('INVALID_TOOL_ARGS')
            expect(result.error.details).toBeDefined()
        })

        it('returns an INVALID_TOOL_ARGS envelope when the adapter could not parse the arguments', () => {
            const registry = createToolRegistry({tools: [echoTool]})

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
            const registry = createToolRegistry({tools: [guardedTool]})

            read(registry.invoke$({id: 'c1', name: 'echo', input: {}}))

            expect(invoked).toBe(false)
        })
    })
})
