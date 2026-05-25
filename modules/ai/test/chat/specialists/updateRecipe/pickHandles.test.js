const {of, throwError} = require('rxjs')
const {pickHandles$, pickerSystemPrompt} = require('#mcp/chat/specialists/updateRecipe/pickHandles')
const {aFakeLlm, read, readError} = require('../../builders')

describe('pickHandles$', () => {

    function scriptedLlm(text) {
        return aFakeLlm({replies: [{text}]})
    }

    it('returns the handles array from a JSON response', () => {
        const llm = scriptedLlm('{"handles":["datasets","corrections"]}')

        const result = read(pickHandles$({llm, recipeType: 'MOSAIC', instruction: 'only use Landsat', conversationId: 'c1'}))

        expect(result).toEqual({ok: true, handles: ['datasets', 'corrections']})
    })

    it('strips ```json fences around the JSON', () => {
        const llm = scriptedLlm('```json\n{"handles":["targetDate"]}\n```')

        const result = read(pickHandles$({llm, recipeType: 'MOSAIC', instruction: 'shift target to 2023', conversationId: 'c1'}))

        expect(result.handles).toEqual(['targetDate'])
    })

    it('parses the JSON even when the model wraps it in surrounding prose', () => {
        const llm = scriptedLlm('Sure, the relevant handles are: {"handles":["cloudMethods","landsatCloudMask"]}. Done.')

        const result = read(pickHandles$({llm, recipeType: 'MOSAIC', instruction: 'remove residual clouds', conversationId: 'c1'}))

        expect(result.handles).toEqual(['cloudMethods', 'landsatCloudMask'])
    })

    it('keeps only handles present in the recipe catalog and drops unknowns', () => {
        const llm = scriptedLlm('{"handles":["targetDate","bogus","seasonStart"]}')

        const result = read(pickHandles$({llm, recipeType: 'MOSAIC', instruction: 'shift dates', conversationId: 'c1'}))

        expect(result.handles).toEqual(['targetDate', 'seasonStart'])
    })

    it('de-duplicates handles preserving first-seen order', () => {
        const llm = scriptedLlm('{"handles":["datasets","datasets","corrections"]}')

        const result = read(pickHandles$({llm, recipeType: 'MOSAIC', instruction: 'x', conversationId: 'c1'}))

        expect(result.handles).toEqual(['datasets', 'corrections'])
    })

    it('returns ok=false with PICKER_EMPTY when the model returned no recognised handle', () => {
        const llm = scriptedLlm('{"handles":[]}')

        const result = read(pickHandles$({llm, recipeType: 'MOSAIC', instruction: 'x', conversationId: 'c1'}))

        expect(result.ok).toBe(false)
        expect(result.error.code).toBe('PICKER_EMPTY')
    })

    it('returns ok=false with PICKER_PARSE_FAILED for non-JSON output', () => {
        const llm = scriptedLlm('I think you should change the cloud masking.')

        const result = read(pickHandles$({llm, recipeType: 'MOSAIC', instruction: 'x', conversationId: 'c1'}))

        expect(result.ok).toBe(false)
        expect(result.error.code).toBe('PICKER_PARSE_FAILED')
    })

    it('returns ok=false with UNSUPPORTED_RECIPE_TYPE for an unknown recipe type', () => {
        const llm = scriptedLlm('{"handles":["targetDate"]}')

        const result = read(pickHandles$({llm, recipeType: 'BOGUS', instruction: 'x', conversationId: 'c1'}))

        expect(result.ok).toBe(false)
        expect(result.error.code).toBe('UNSUPPORTED_RECIPE_TYPE')
    })

    it('does not pass any tools to the LLM (tool-free call)', () => {
        const llm = scriptedLlm('{"handles":["targetDate"]}')

        read(pickHandles$({llm, recipeType: 'MOSAIC', instruction: 'x', conversationId: 'c1'}))

        expect(llm.receivedTools[0]).toEqual([])
    })

    it('puts the static picker prompt + recipe handle catalog as the system message and the instruction as the user message', () => {
        const llm = scriptedLlm('{"handles":["targetDate"]}')

        read(pickHandles$({llm, recipeType: 'MOSAIC', instruction: 'shift dates back a year', conversationId: 'c1'}))

        const messages = llm.receivedMessages[0]
        expect(messages[0].role).toBe('system')
        expect(messages[messages.length - 1].role).toBe('user')
        expect(messages[messages.length - 1].content).toContain('shift dates back a year')
    })

    it('exposes a recipe-aware system prompt that lists every recipe handle by name', () => {
        const prompt = pickerSystemPrompt('MOSAIC')

        expect(prompt).toContain('datasets')
        expect(prompt).toContain('cloudMethods')
        expect(prompt).toContain('targetDate')
    })

    it('the picker prompt does not expose JSON Pointer paths or RFC 6902 patch mechanics', () => {
        const prompt = pickerSystemPrompt('MOSAIC')

        expect(prompt).not.toMatch(/\/compositeOptions\//)
        expect(prompt).not.toMatch(/RFC 6902/i)
        expect(prompt).not.toMatch(/JSON Patch/i)
        expect(prompt).not.toMatch(/JSON Pointer/i)
    })

    it('surfaces an upstream LLM error as a PICKER_FAILED envelope', () => {
        const llm = {
            respondTo$: () => throwError(() => new Error('llm boom')),
            receivedMessages: [], receivedTools: [], receivedRequests: []
        }

        const result = read(pickHandles$({llm, recipeType: 'MOSAIC', instruction: 'x', conversationId: 'c1'}))

        expect(result.ok).toBe(false)
        expect(result.error.code).toBe('PICKER_FAILED')
    })

    it('does not blow up the caller when LLM throws (read returns envelope, not error)', () => {
        const llm = {
            respondTo$: () => throwError(() => new Error('boom')),
            receivedMessages: [], receivedTools: [], receivedRequests: []
        }

        // Should produce an envelope, not throw to the subscriber.
        expect(readError(pickHandles$({llm, recipeType: 'MOSAIC', instruction: 'x', conversationId: 'c1'}))).toBeUndefined()
    })
})
