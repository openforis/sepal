const {createToolCallGuard} = require('#mcp/chat/toolCallGuard')

describe('toolCallGuard', () => {

    const consecutiveFailureBail = (tool, max) => `consecutive:${tool}:${max}`
    const invalidArgsBail = (tool, max) => `invalid-args:${tool}:${max}`

    function aGuard() {
        return createToolCallGuard({consecutiveFailureBail, invalidArgsBail})
    }

    function aFailure(code = 'TOOL_FAILED') {
        return {ok: false, error: {code, message: 'x'}}
    }

    function aSuccess(data = {}) {
        return {ok: true, data}
    }

    describe('blockedRepeat', () => {

        it('returns null for a call that has not been seen', () => {
            const guard = aGuard()

            expect(guard.blockedRepeat({name: 'recipe_list', input: {}})).toBeNull()
        })

        it('returns a TOOL_REPEAT_BLOCKED envelope for an identical call after a failure', () => {
            const guard = aGuard()
            const toolCall = {name: 'recipe_list', input: {filter: 'mine'}}

            guard.record(toolCall, aFailure())

            expect(guard.blockedRepeat(toolCall)).toEqual({
                ok: false,
                error: {code: 'TOOL_REPEAT_BLOCKED', message: expect.stringMatching(/repeat/i)}
            })
        })

        it('does not block a call whose prior result was successful', () => {
            const guard = aGuard()
            const toolCall = {name: 'recipe_list', input: {filter: 'mine'}}

            guard.record(toolCall, aSuccess())

            expect(guard.blockedRepeat(toolCall)).toBeNull()
        })

        it('treats objects with the same keys in different orders as identical', () => {
            const guard = aGuard()

            guard.record({name: 'recipe_load', input: {id: 'r1', path: '/x'}}, aFailure())

            expect(guard.blockedRepeat({name: 'recipe_load', input: {path: '/x', id: 'r1'}})).not.toBeNull()
        })

        it('canonicalizes nested objects and arrays', () => {
            const guard = aGuard()

            guard.record({name: 't', input: {nested: {b: 2, a: 1}, ids: ['r1', 'r2']}}, aFailure())

            expect(guard.blockedRepeat({name: 't', input: {ids: ['r1', 'r2'], nested: {a: 1, b: 2}}})).not.toBeNull()
        })

        it('treats arrays as order-sensitive', () => {
            const guard = aGuard()

            guard.record({name: 't', input: {ids: ['r1', 'r2']}}, aFailure())

            expect(guard.blockedRepeat({name: 't', input: {ids: ['r2', 'r1']}})).toBeNull()
        })

        it('does not block when only the tool name differs', () => {
            const guard = aGuard()

            guard.record({name: 'recipe_list', input: {}}, aFailure())

            expect(guard.blockedRepeat({name: 'project_list', input: {}})).toBeNull()
        })
    })

    describe('bail', () => {

        it('returns null until a counter hits its limit', () => {
            const guard = aGuard()

            guard.record({name: 't', input: {}}, aFailure())
            guard.record({name: 't', input: {a: 1}}, aFailure())

            expect(guard.bail()).toBeNull()
        })

        it('triggers the consecutive-failure bail after three non-args failures of the same tool', () => {
            const guard = aGuard()
            const fail = i => guard.record({name: 't', input: {i}}, aFailure())

            fail(1); fail(2); fail(3)

            expect(guard.bail()).toBe('consecutive:t:3')
        })

        it('triggers the invalid-args bail after three INVALID_TOOL_ARGS failures of the same tool', () => {
            const guard = aGuard()
            const fail = i => guard.record({name: 't', input: {i}}, aFailure('INVALID_TOOL_ARGS'))

            fail(1); fail(2); fail(3)

            expect(guard.bail()).toBe('invalid-args:t:3')
        })

        it('resets the consecutive-failure counter on a same-tool success', () => {
            const guard = aGuard()

            guard.record({name: 't', input: {a: 1}}, aFailure())
            guard.record({name: 't', input: {a: 2}}, aFailure())
            guard.record({name: 't', input: {a: 3}}, aSuccess())
            guard.record({name: 't', input: {a: 4}}, aFailure())
            guard.record({name: 't', input: {a: 5}}, aFailure())

            expect(guard.bail()).toBeNull()
        })

        it('does not reset another tool\'s counter when a different tool succeeds', () => {
            const guard = aGuard()

            guard.record({name: 'a', input: {x: 1}}, aFailure())
            guard.record({name: 'a', input: {x: 2}}, aFailure())
            guard.record({name: 'b', input: {}}, aSuccess())
            guard.record({name: 'a', input: {x: 3}}, aFailure())

            expect(guard.bail()).toBe('consecutive:a:3')
        })

        it('counts INVALID_TOOL_ARGS only against the invalid-args limit, not the consecutive cap', () => {
            const guard = aGuard()

            guard.record({name: 't', input: {a: 1}}, aFailure('INVALID_TOOL_ARGS'))
            guard.record({name: 't', input: {a: 2}}, aFailure('INVALID_TOOL_ARGS'))
            guard.record({name: 't', input: {a: 3}}, aFailure('TOOL_FAILED'))

            expect(guard.bail()).toBeNull()
        })

        it('keeps the first bail value once triggered and ignores later ticks', () => {
            const guard = aGuard()

            guard.record({name: 't', input: {a: 1}}, aFailure())
            guard.record({name: 't', input: {a: 2}}, aFailure())
            guard.record({name: 't', input: {a: 3}}, aFailure())
            guard.record({name: 't', input: {a: 4}}, aFailure('INVALID_TOOL_ARGS'))
            guard.record({name: 't', input: {a: 5}}, aFailure('INVALID_TOOL_ARGS'))
            guard.record({name: 't', input: {a: 6}}, aFailure('INVALID_TOOL_ARGS'))

            expect(guard.bail()).toBe('consecutive:t:3')
        })
    })
})
