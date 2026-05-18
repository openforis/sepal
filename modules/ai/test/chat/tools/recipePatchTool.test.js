const {of, throwError} = require('rxjs')
const {recipePatchTool} = require('#mcp/chat/tools/recipePatchTool')
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
            expect(tool.parameters).toEqual({
                type: 'object',
                properties: {
                    recipeId: {type: 'string'},
                    baseModelHash: {type: 'string'},
                    operations: {type: 'array', minItems: 1, items: {type: 'object'}}
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
    })
})
