const {of, throwError} = require('rxjs')
const {createToolRegistry} = require('#mcp/chat/tools/registry')
const {aFakeBus, read} = require('../builders')

describe('tool registry — schemas and invoke envelopes', () => {

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

        it('does not include the directAnswer flag in schemas() output (would leak to the LLM wire format)', () => {
            const directTool = {...echoTool, name: 'direct', directAnswer: true}
            const registry = createToolRegistry({tools: [directTool], bus})

            const schema = registry.schemas()[0]
            expect(schema).not.toHaveProperty('directAnswer')
            expect(Object.keys(schema).sort()).toEqual(['description', 'name', 'parameters'])
        })
    })

    describe('flag', () => {

        it('returns true when the tool descriptor carries the named flag set to true', () => {
            const directTool = {...echoTool, name: 'direct', directAnswer: true}
            const registry = createToolRegistry({tools: [directTool], bus})

            expect(registry.flag('direct', 'directAnswer')).toBe(true)
        })

        it('returns false when the tool exists but does not carry the named flag', () => {
            const registry = createToolRegistry({tools: [echoTool], bus})

            expect(registry.flag('echo', 'directAnswer')).toBe(false)
        })

        it('returns false for an unknown tool name', () => {
            const registry = createToolRegistry({tools: [echoTool], bus})

            expect(registry.flag('nonexistent', 'directAnswer')).toBe(false)
        })
    })

    describe('invoke$', () => {

        it('wraps a tool result in a success envelope', () => {
            const registry = createToolRegistry({tools: [echoTool], bus})

            const result = read(registry.invoke$({id: 'c1', name: 'echo', input: {text: 'hi'}}))

            expect(result).toEqual({ok: true, data: {echoed: 'hi'}})
        })

        it('passes through an envelope-shaped tool result unchanged (no double-wrap)', () => {
            // Tools may explicitly return an envelope to carry structured success/failure
            // (e.g. recipe_patch, update_recipe). Double-wrapping would hide the outcome
            // from tool-end events and from the LLM behind data.ok.
            const envelopeTool = {
                name: 'envelope_tool',
                description: 'x',
                parameters: {type: 'object', properties: {}, additionalProperties: true},
                invoke$: () => of({ok: false, error: {code: 'STALE_WRITE', message: 'hash mismatch'}})
            }
            const registry = createToolRegistry({tools: [envelopeTool], bus})

            const result = read(registry.invoke$({id: 'c1', name: 'envelope_tool', input: {}}))

            expect(result).toEqual({ok: false, error: {code: 'STALE_WRITE', message: 'hash mismatch'}})
        })

        it('passes the turn context through to the tool', () => {
            const seen = []
            const guiContextTool = {
                name: 'gui_context_tool',
                description: 'x',
                parameters: {type: 'object', properties: {}, additionalProperties: true},
                invoke$: (_input, context) => {
                    seen.push(context)
                    return of('ok')
                }
            }
            const registry = createToolRegistry({tools: [guiContextTool], bus})
            const context = {conversationId: 'conv-1', channel: {}}

            read(registry.invoke$({id: 'c1', name: 'gui_context_tool', input: {}}, context))

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
})
