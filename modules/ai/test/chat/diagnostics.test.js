import {createDiagnostics, MAX_DEBUG_TEXT, truncateString} from '#mcp/chat/diagnostics'

describe('diagnostics', () => {

    describe('truncateString', () => {

        it('returns short strings unchanged', () => {
            expect(truncateString('hello', 100)).toBe('hello')
        })

        it('truncates strings over the limit and marks them', () => {
            const long = 'x'.repeat(50)
            expect(truncateString(long, 10)).toBe(`${'x'.repeat(10)}...`)
        })

        it('returns non-strings unchanged', () => {
            expect(truncateString(42, 10)).toBe(42)
            expect(truncateString(null, 10)).toBe(null)
            expect(truncateString(undefined, 10)).toBe(undefined)
        })

        it('defaults to MAX_DEBUG_TEXT when no limit is given', () => {
            const long = 'x'.repeat(MAX_DEBUG_TEXT + 10)
            expect(truncateString(long).length).toBe(MAX_DEBUG_TEXT + 3)
        })
    })

    describe('summarizeMessages — bounded by default', () => {
        const diagnostics = createDiagnostics()

        it('replaces a user message body with role and content size', () => {
            const summary = diagnostics.summarizeMessages([
                {role: 'user', content: 'hello world'}
            ])

            expect(JSON.parse(summary)).toEqual([{role: 'user', contentChars: 11}])
        })

        it('preserves assistant tool-call shape with tool names but drops the input payload', () => {
            const summary = diagnostics.summarizeMessages([
                {role: 'assistant', content: 'Calling', toolCalls: [
                    {id: 'a', name: 'recipe_list', input: {filter: 'mine'}}
                ]}
            ])

            const parsed = JSON.parse(summary)
            expect(parsed).toEqual([{
                role: 'assistant',
                contentChars: 7,
                toolCalls: [{id: 'a', name: 'recipe_list', inputKeys: ['filter']}]
            }])
        })

        it('replaces tool-result envelopes with shape descriptors, not raw data', () => {
            const summary = diagnostics.summarizeMessages([
                {role: 'tool', toolResults: [
                    {toolCallId: 'a', toolName: 'recipe_list', result: {ok: true, data: [{id: 'r1'}, {id: 'r2'}]}}
                ]}
            ])

            expect(JSON.parse(summary)).toEqual([{
                role: 'tool',
                toolResults: [{toolCallId: 'a', toolName: 'recipe_list', ok: true, shape: 'array(2)'}]
            }])
        })

        it('summarizes failed tool results with the error code', () => {
            const summary = diagnostics.summarizeMessages([
                {role: 'tool', toolResults: [
                    {toolCallId: 'a', toolName: 'recipe_list', result: {ok: false, error: {code: 'TOOL_FAILED', message: 'boom'}}}
                ]}
            ])

            expect(JSON.parse(summary)).toEqual([{
                role: 'tool',
                toolResults: [{toolCallId: 'a', toolName: 'recipe_list', ok: false, shape: 'error:TOOL_FAILED'}]
            }])
        })

        it('produces deterministic output regardless of object key insertion order', () => {
            const a = diagnostics.summarizeMessages([{role: 'user', content: 'hi'}])
            const b = diagnostics.summarizeMessages([{content: 'hi', role: 'user'}])

            expect(a).toBe(b)
        })

        it('handles circular references without throwing', () => {
            const circular = {role: 'assistant', content: 'x', toolCalls: [{id: 'a', name: 't', input: {}}]}
            circular.toolCalls[0].input.self = circular

            expect(() => diagnostics.summarizeMessages([circular])).not.toThrow()
        })
    })

    describe('summarizeTools — bounded by default', () => {
        const diagnostics = createDiagnostics()

        it('keeps tool names and parameter keys but drops descriptions to a size', () => {
            const summary = diagnostics.summarizeTools([
                {
                    name: 'recipe_list',
                    description: 'List the recipes for the user.',
                    parameters: {
                        type: 'object',
                        properties: {filter: {type: 'string'}, limit: {type: 'integer'}},
                        required: ['filter']
                    }
                }
            ])

            expect(JSON.parse(summary)).toEqual([{
                name: 'recipe_list',
                descriptionChars: 'List the recipes for the user.'.length,
                parameterKeys: ['filter', 'limit']
            }])
        })

        it('handles tools without parameters', () => {
            const summary = diagnostics.summarizeTools([
                {name: 'ping', description: 'd', parameters: {type: 'object'}}
            ])

            expect(JSON.parse(summary)).toEqual([{name: 'ping', descriptionChars: 1, parameterKeys: []}])
        })
    })

    describe('summarizeObject — bounded by default', () => {
        const diagnostics = createDiagnostics()

        it('reports the shape of a plain object without leaking values', () => {
            expect(diagnostics.summarizeObject({a: 1, b: 'long string'})).toBe('object(keys=a|b)')
        })

        it('reports array length', () => {
            expect(diagnostics.summarizeObject([1, 2, 3])).toBe('array(3)')
        })

        it('reports scalar types with size for strings', () => {
            expect(diagnostics.summarizeObject('hello')).toBe('string(5)')
            expect(diagnostics.summarizeObject(42)).toBe('number')
            expect(diagnostics.summarizeObject(true)).toBe('boolean')
            expect(diagnostics.summarizeObject(null)).toBe('null')
        })

        it('handles circular references', () => {
            const obj = {a: 1}
            obj.self = obj
            expect(() => diagnostics.summarizeObject(obj)).not.toThrow()
        })
    })

    describe('full-payload opt-in', () => {

        it('emits full stable JSON for messages when fullPayloads is true', () => {
            const diagnostics = createDiagnostics({fullPayloads: true})

            const summary = diagnostics.summarizeMessages([
                {role: 'user', content: 'hello world'}
            ])

            expect(summary).toBe('[{"content":"hello world","role":"user"}]')
        })

        it('emits full stable JSON for tools when fullPayloads is true', () => {
            const diagnostics = createDiagnostics({fullPayloads: true})

            const summary = diagnostics.summarizeTools([
                {name: 'ping', description: 'pong', parameters: {type: 'object'}}
            ])

            expect(JSON.parse(summary)).toEqual([
                {name: 'ping', description: 'pong', parameters: {type: 'object'}}
            ])
        })

        it('still truncates over-long full payloads at MAX_DEBUG_TEXT', () => {
            const diagnostics = createDiagnostics({fullPayloads: true})
            const huge = 'x'.repeat(MAX_DEBUG_TEXT * 2)

            const summary = diagnostics.summarizeMessages([{role: 'user', content: huge}])

            expect(summary.length).toBe(MAX_DEBUG_TEXT + 3)
            expect(summary.endsWith('...')).toBe(true)
        })

        it('sorts keys deterministically in full payload mode', () => {
            const diagnostics = createDiagnostics({fullPayloads: true})

            const a = diagnostics.summarizeMessages([{role: 'user', content: 'hi'}])
            const b = diagnostics.summarizeMessages([{content: 'hi', role: 'user'}])

            expect(a).toBe(b)
        })
    })

    describe('exposes the fullPayloads flag', () => {

        it('reports false by default', () => {
            expect(createDiagnostics().fullPayloads).toBe(false)
        })

        it('reports true when constructed with the flag', () => {
            expect(createDiagnostics({fullPayloads: true}).fullPayloads).toBe(true)
        })
    })
})
