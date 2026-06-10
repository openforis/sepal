import {of, throwError} from 'rxjs'

import {pickerSystemPrompt, pickHandles$} from '#mcp/chat/specialists/updateRecipe/pickHandles'

import {aFakeBus, aFakeLlm, expectNoHandlePathsIn, read, readError} from '../../builders.js'

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

    it('returns ok=false with PICKER_EMPTY when the model returned no recognised handle (default flow=update)', () => {
        const llm = scriptedLlm('{"handles":[]}')

        const result = read(pickHandles$({llm, recipeType: 'MOSAIC', instruction: 'x', conversationId: 'c1'}))

        expect(result.ok).toBe(false)
        expect(result.error.code).toBe('PICKER_EMPTY')
    })

    it('accepts an empty handles array as ok=true when allowEmpty=true (create flow tolerates picker silence)', () => {
        const llm = scriptedLlm('{"handles":[]}')

        const result = read(pickHandles$({llm, recipeType: 'MOSAIC', instruction: 'Create a mosaic', conversationId: 'c1', allowEmpty: true}))

        expect(result).toEqual({ok: true, handles: []})
    })

    it('still returns PICKER_PARSE_FAILED for non-JSON output even when allowEmpty=true (allowEmpty does not bypass other failures)', () => {
        const llm = scriptedLlm('I think we should create a mosaic.')

        const result = read(pickHandles$({llm, recipeType: 'MOSAIC', instruction: 'Create a mosaic', conversationId: 'c1', allowEmpty: true}))

        expect(result.ok).toBe(false)
        expect(result.error.code).toBe('PICKER_PARSE_FAILED')
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

    it('disables reasoning and uses a small output cap because handle picking is classification', () => {
        const llm = scriptedLlm('{"handles":["targetDate"]}')

        read(pickHandles$({llm, recipeType: 'MOSAIC', instruction: 'x', conversationId: 'c1'}))

        expect(llm.receivedRequests[0]).toMatchObject({
            disableReasoning: true,
            maxTokens: 512
        })
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

    it('the picker prompt carries picker-specific guidance without exposing value-selection payloads wholesale', () => {
        const prompt = pickerSystemPrompt('MOSAIC')

        expect(prompt).toMatch(/selection:.*LANDSAT_TM.*1990s/i)
        expect(prompt).toMatch(/selection:.*bare-year/i)
        expect(prompt).not.toMatch(/valueGuidance/i)
    })

    it('the picker prompt instructs the model not to include rationale alongside the handles', () => {
        const prompt = pickerSystemPrompt('MOSAIC')

        expect(prompt).toMatch(/no rationale/i)
    })

    it('teaches the picker not to pick a prerequisite handle (e.g. datasets) unless the user explicitly asked to change it', () => {
        const prompt = pickerSystemPrompt('MOSAIC')

        expect(prompt).toMatch(/prerequisite/i)
        expect(prompt).toMatch(/datasets/)
        expect(prompt).toMatch(/only.*(explicit|when the user)/i)
    })

    it('illustrates the rule with the Cloud Score+ examples that separate "swap a method" from "switch sources too"', () => {
        const prompt = pickerSystemPrompt('MOSAIC')

        expect(prompt).toMatch(/cloud score\+/i)
        expect(prompt).toMatch(/cloudMethods only/i)
        expect(prompt).toMatch(/datasets.*cloudMethods|cloudMethods.*datasets/)
    })

    it('declares update.picker as the LLM usage role so usage rolls up to the right slot', () => {
        const llm = scriptedLlm('{"handles":["targetDate"]}')

        read(pickHandles$({llm, recipeType: 'MOSAIC', instruction: 'x', conversationId: 'c1'}))

        expect(llm.receivedRequests[0].usageContext).toMatchObject({role: 'update.picker', recipeType: 'MOSAIC'})
    })

    it('tags the LLM usage role and bus event with the create flow when flow=create', () => {
        const bus = aFakeBus()
        const llm = scriptedLlm('{"handles":["cloudMethods"]}')

        read(pickHandles$({llm, bus, recipeType: 'MOSAIC', instruction: 'aggressive cloud masking', conversationId: 'c1', flow: 'create'}))

        expect(llm.receivedRequests[0].usageContext).toMatchObject({role: 'create.picker', recipeType: 'MOSAIC'})
        expect(bus.published.find(event => event.type === 'create_recipe.picker.completed')).toBeDefined()
        expect(bus.published.find(event => event.type === 'update_recipe.picker.completed')).toBeUndefined()
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
