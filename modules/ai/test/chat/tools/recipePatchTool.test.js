const {concat, of, throwError, toArray} = require('rxjs')
const {recipePatchTool} = require('#mcp/chat/tools/recipePatchTool')
const {emitChannel, guiAction, isChannelEmission} = require('#mcp/chat/channelEvents')
const {aFakeGuiRequests, read} = require('../builders')

describe('recipe_patch tool', () => {

    const context = {clientId: 'c1', subscriptionId: 's1'}
    const validInput = {
        recipeId: 'r1',
        baseModelHash: 'h-base',
        operations: [{op: 'replace', path: '/dates/seasonEnd', value: '2025-06-01'}]
    }

    describe('schema', () => {

        it('declares the documented parameters (recipeId, baseModelHash, operations all required)', () => {
            const tool = recipePatchTool(aFakeGuiRequests())

            expect(tool.name).toBe('recipe_patch')
            expect(typeof tool.description).toBe('string')
            expect(tool.description).toContain('one operations array')
            expect(tool.parameters).toEqual({
                type: 'object',
                properties: {
                    recipeId: {type: 'string', description: 'The one recipe being patched.'},
                    baseModelHash: {type: 'string', description: 'baseModelHash returned by the preceding recipe_load.'},
                    operations: {
                        type: 'array',
                        minItems: 1,
                        description: 'One or more RFC 6902 operations. Group related changes here, e.g. targetDate plus seasonStart plus seasonEnd in the same array.',
                        items: {
                            type: 'object',
                            description: 'A single RFC 6902 operation. Paths are model-relative JSON Pointers such as /dates/targetDate.',
                            properties: {
                                op: {type: 'string', enum: ['add', 'remove', 'replace', 'move', 'copy', 'test']},
                                path: {type: 'string', description: 'Model-relative JSON Pointer path.'},
                                value: {description: 'Value for add, replace, and test operations.'},
                                from: {type: 'string', description: 'Source JSON Pointer for move and copy operations.'}
                            },
                            required: ['op', 'path'],
                            additionalProperties: false
                        }
                    }
                },
                required: ['recipeId', 'baseModelHash', 'operations'],
                additionalProperties: false
            })
        })
    })

    describe('invocation', () => {

        it('issues a recipe-patch GUI request carrying recipeId, baseModelHash and operations', () => {
            const guiRequests = aFakeGuiRequests(() => of({summary: 'ok', modelHash: 'h-new', invalidatedPaths: ['/dates/seasonEnd']}))
            const tool = recipePatchTool(guiRequests)

            read(tool.invoke$(validInput, context))

            expect(guiRequests.requests).toEqual([{
                clientId: 'c1', subscriptionId: 's1', action: 'recipe-patch', params: validInput
            }])
        })

        it('wraps a successful GUI response as {ok: true, data}', () => {
            const data = {summary: 'Applied 1 operation to r1.', modelHash: 'h-new', invalidatedPaths: ['/dates/seasonEnd']}
            const tool = recipePatchTool(aFakeGuiRequests(() => of(data)))

            const result = read(tool.invoke$(validInput, context))

            expect(result).toEqual({ok: true, data})
        })

        it('wraps an unstructured GUI failure as {ok: false, error: TOOL_FAILED}', () => {
            const tool = recipePatchTool(aFakeGuiRequests(() => throwError(() => new Error('GUI gone'))))

            const result = read(tool.invoke$(validInput, context))

            expect(result).toEqual({ok: false, error: {code: 'TOOL_FAILED', message: 'GUI gone'}})
        })
    })

    describe('structured error code passthrough', () => {

        function patchFailingWith(error) {
            return read(recipePatchTool(aFakeGuiRequests(() => throwError(() => error)))
                .invoke$(validInput, context))
        }

        it('propagates STALE_WRITE with currentModelHash so the specialist can reload + retry', () => {
            const result = patchFailingWith(Object.assign(new Error('base hash mismatch'), {
                code: 'STALE_WRITE',
                currentModelHash: 'h-current'
            }))

            expect(result).toEqual({
                ok: false,
                error: {code: 'STALE_WRITE', message: 'base hash mismatch', currentModelHash: 'h-current'}
            })
        })

        it('propagates INVALID_PATCH for malformed patch envelopes', () => {
            const result = patchFailingWith(Object.assign(new Error('empty operations'), {code: 'INVALID_PATCH'}))

            expect(result).toEqual({ok: false, error: {code: 'INVALID_PATCH', message: 'empty operations'}})
        })

        it('propagates PATCH_APPLY_FAILED when the patch cannot apply', () => {
            const result = patchFailingWith(Object.assign(new Error('remove on missing path'), {code: 'PATCH_APPLY_FAILED'}))

            expect(result).toEqual({ok: false, error: {code: 'PATCH_APPLY_FAILED', message: 'remove on missing path'}})
        })

        it('propagates VALIDATION_FAILED with the structured per-path errors array', () => {
            const errors = [{path: '/dates/seasonEnd', message: 'must be in window', rule: 'seasonEndWindow'}]
            const result = patchFailingWith(Object.assign(new Error('post-apply model invalid'), {
                code: 'VALIDATION_FAILED',
                errors
            }))

            expect(result).toEqual({
                ok: false,
                error: {code: 'VALIDATION_FAILED', message: 'post-apply model invalid', errors}
            })
        })

        it('propagates RECIPE_NOT_FOUND for an unknown recipeId', () => {
            const result = patchFailingWith(Object.assign(new Error('Recipe not found: r1'), {code: 'RECIPE_NOT_FOUND'}))

            expect(result).toEqual({ok: false, error: {code: 'RECIPE_NOT_FOUND', message: 'Recipe not found: r1'}})
        })

        it('passes channel emissions through unchanged — only the actual data is wrapped as an envelope (regression: double tool-result)', async () => {
            const data = {summary: 'applied', modelHash: 'h-new', invalidatedPaths: ['/dates/seasonEnd']}
            // Mirror real guiRequests.request$ behavior: channel event first, then the outcome.
            const guiRequests = aFakeGuiRequests(() => concat(
                of(emitChannel(guiAction({requestId: 'req-1', action: 'recipe-patch', params: validInput}))),
                of(data)
            ))
            const tool = recipePatchTool(guiRequests)

            const emissions = await tool.invoke$(validInput, context).pipe(toArray()).toPromise()

            expect(emissions).toHaveLength(2)
            expect(isChannelEmission(emissions[0])).toBe(true)
            expect(emissions[1]).toEqual({ok: true, data})
        })
    })
})
