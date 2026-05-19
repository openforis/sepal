const {concat, of, throwError, toArray} = require('rxjs')
const {lookupRecipeMetadata$} = require('#mcp/chat/tools/recipeMetadata')
const {emitChannel, guiAction, isChannelEmission} = require('#mcp/chat/channelEvents')
const {aFakeGuiRequests, read} = require('../builders')

describe('lookupRecipeMetadata$', () => {

    const context = {clientId: 'c1', subscriptionId: 's1'}

    it('issues a recipe-metadata GUI request with the given recipeId', () => {
        const guiRequests = aFakeGuiRequests(() => of({id: 'r1', type: 'MOSAIC', name: 'k', projectId: 'p1'}))

        read(lookupRecipeMetadata$(guiRequests, context, 'r1'))

        expect(guiRequests.requests).toEqual([{
            clientId: 'c1', subscriptionId: 's1', action: 'recipe-metadata', params: {recipeId: 'r1'}
        }])
    })

    it('wraps a successful GUI response as a tool-result envelope {ok: true, data}', () => {
        const metadata = {id: 'r1', type: 'MOSAIC', name: 'Kenya', projectId: 'p1'}
        const guiRequests = aFakeGuiRequests(() => of(metadata))

        const result = read(lookupRecipeMetadata$(guiRequests, context, 'r1'))

        expect(result).toEqual({ok: true, data: metadata})
    })

    it('wraps a GUI failure as a tool-result envelope {ok: false, error: TOOL_FAILED} when the error has no code', () => {
        const guiRequests = aFakeGuiRequests(() => throwError(() => new Error('no such recipe')))

        const result = read(lookupRecipeMetadata$(guiRequests, context, 'missing'))

        expect(result).toEqual({
            ok: false,
            error: {code: 'TOOL_FAILED', message: 'no such recipe'}
        })
    })

    it('propagates a structured error code from the bridge (e.g. RECIPE_NOT_FOUND) instead of flattening to TOOL_FAILED', () => {
        const codedError = Object.assign(new Error('Recipe not found: r1'), {code: 'RECIPE_NOT_FOUND'})
        const guiRequests = aFakeGuiRequests(() => throwError(() => codedError))

        const result = read(lookupRecipeMetadata$(guiRequests, context, 'r1'))

        expect(result).toEqual({
            ok: false,
            error: {code: 'RECIPE_NOT_FOUND', message: 'Recipe not found: r1'}
        })
    })

    it('passes channel emissions through unchanged — only the actual data is wrapped as an envelope (regression: double tool-result)', async () => {
        const metadata = {id: 'r1', type: 'MOSAIC', name: 'k', projectId: 'p1'}
        // Mirror what the real guiRequests.request$ emits: channel event (gui-action) then the outcome.
        const guiRequests = aFakeGuiRequests(() => concat(
            of(emitChannel(guiAction({requestId: 'req-1', action: 'recipe-metadata', params: {recipeId: 'r1'}}))),
            of(metadata)
        ))

        const emissions = await lookupRecipeMetadata$(guiRequests, context, 'r1').pipe(toArray()).toPromise()

        // Exactly two emissions: one channel event passed through, one envelope.
        expect(emissions).toHaveLength(2)
        expect(isChannelEmission(emissions[0])).toBe(true)
        expect(emissions[1]).toEqual({ok: true, data: metadata})
    })
})
