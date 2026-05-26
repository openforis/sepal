const {of, throwError} = require('rxjs')
const {pickHandles$, pickerSystemPrompt} = require('#mcp/chat/specialists/updateRecipe/pickHandles')
const {aFakeBus, aFakeLlm, expectNoHandlePathsIn, read, readError} = require('../../builders')

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

        expectNoHandlePathsIn(prompt)
        expect(prompt).not.toMatch(/RFC 6902/i)
        expect(prompt).not.toMatch(/JSON Patch/i)
        expect(prompt).not.toMatch(/JSON Pointer/i)
    })

    it('the picker prompt carries user-facing handle labels and performance notes', () => {
        const prompt = pickerSystemPrompt('MOSAIC')

        expect(prompt).toContain('Source datasets')
        expect(prompt).toContain('Cloud-edge buffer')
        expect(prompt).toMatch(/performance:.*spatial|performance:.*expensive/i)
    })

    it('the picker prompt instructs the model not to include rationale alongside the handles', () => {
        const prompt = pickerSystemPrompt('MOSAIC')

        expect(prompt).toMatch(/no rationale/i)
    })

    it('declares update.picker as the LLM usage role so usage rolls up to the right slot', () => {
        const llm = scriptedLlm('{"handles":["targetDate"]}')

        read(pickHandles$({llm, recipeType: 'MOSAIC', instruction: 'x', conversationId: 'c1'}))

        expect(llm.receivedRequests[0].usageContext).toMatchObject({role: 'update.picker', recipeType: 'MOSAIC'})
    })

    it('publishes update_recipe.picker.completed with handle names + counts on success', () => {
        const bus = aFakeBus()
        const llm = scriptedLlm('{"handles":["targetDate","cloudMethods"]}')

        read(pickHandles$({llm, bus, recipeType: 'MOSAIC', instruction: 'x', conversationId: 'c1'}))

        const events = bus.published.filter(event => event.type === 'update_recipe.picker.completed')
        expect(events).toHaveLength(1)
        expect(events[0]).toMatchObject({
            recipeType: 'MOSAIC',
            pickedHandleCount: 2,
            pickedHandles: ['targetDate', 'cloudMethods']
        })
        expect(events[0]).not.toHaveProperty('rationale')
    })

    it('does not publish picker.completed on failure', () => {
        const bus = aFakeBus()
        const llm = scriptedLlm('not JSON')

        read(pickHandles$({llm, bus, recipeType: 'MOSAIC', instruction: 'x', conversationId: 'c1'}))

        expect(bus.published.filter(event => event.type === 'update_recipe.picker.completed')).toHaveLength(0)
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
