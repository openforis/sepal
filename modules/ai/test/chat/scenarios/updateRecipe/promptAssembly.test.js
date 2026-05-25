const {aToolFactoryHarness} = require('../../harness')
const {metadataFor, mosaicMetadata, unspeccedMetadata} = require('./fixtures')

// The new picker/updater prompts are split:
// - picker prompt: recipe handle catalog (system), tool-free
// - updater prompt: generic + the prepared handle packet (system + user)
// Neither model-facing prompt should expose JSON Pointer paths or RFC 6902.
describe('update_recipe per-type prompt assembly', () => {

    function pickerSystemPromptFor(metadata) {
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            guiRequests: metadataFor(metadata),
            replies: [{text: '{"handles":["targetDate"]}'}, {text: 'OK'}]
        })
        harness.invoke({recipeId: metadata.id, instruction: 'edit'})
        return harness.llm.receivedMessages[0][0].content
    }

    function updaterSystemPromptFor(metadata) {
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            guiRequests: metadataFor(metadata),
            replies: [{text: '{"handles":["targetDate"]}'}, {text: 'OK'}]
        })
        harness.invoke({recipeId: metadata.id, instruction: 'edit'})
        return harness.llm.receivedMessages[1][0].content
    }

    describe('on a MOSAIC recipe', () => {

        it('uses the picker prompt as the first system message and includes the recipe handle catalog', () => {
            const prompt = pickerSystemPromptFor(mosaicMetadata)

            expect(prompt).toMatch(/select which recipe fields/i)
            expect(prompt).toContain('Recipe type: MOSAIC')
            expect(prompt).toContain('datasets')
            expect(prompt).toContain('cloudMethods')
        })

        it('keeps JSON Pointer paths and RFC 6902 mechanics out of the picker prompt', () => {
            const prompt = pickerSystemPromptFor(mosaicMetadata)

            expect(prompt).not.toMatch(/\/compositeOptions\//)
            expect(prompt).not.toMatch(/RFC 6902/i)
            expect(prompt).not.toMatch(/JSON Patch/i)
        })

        it('uses the generic updater prompt as the second system message', () => {
            const prompt = updaterSystemPromptFor(mosaicMetadata)

            expect(prompt).toMatch(/update_recipe_values/)
            expect(prompt).toMatch(/writableHandles/)
            expect(prompt).toMatch(/handleErrors/)
        })

        it('keeps JSON Pointer paths and RFC 6902 mechanics out of the updater prompt', () => {
            const prompt = updaterSystemPromptFor(mosaicMetadata)

            expect(prompt).not.toMatch(/\/compositeOptions\//)
            expect(prompt).not.toMatch(/RFC 6902/i)
            expect(prompt).not.toMatch(/JSON Patch/i)
            expect(prompt).not.toMatch(/JSON Pointer/i)
        })

        it('updater prompt does not embed the full JSON schema', () => {
            const prompt = updaterSystemPromptFor(mosaicMetadata)

            expect(prompt).not.toMatch(/```json/)
            expect(prompt).not.toContain('$defs')
        })

        it('updater user message carries the prepared handle packet so handle catalogs do not have to re-appear in the system prompt', () => {
            const harness = aToolFactoryHarness({
                specialist: 'update_recipe',
                guiRequests: metadataFor(mosaicMetadata),
                replies: [{text: '{"handles":["targetDate"]}'}, {text: 'OK'}]
            })
            harness.invoke({recipeId: mosaicMetadata.id, instruction: 'edit'})
            const updaterMessages = harness.llm.receivedMessages[1]
            const userMessage = updaterMessages[updaterMessages.length - 1]
            expect(userMessage.role).toBe('user')
            expect(userMessage.content).toContain('Prepared packet')
            expect(userMessage.content).toContain('"writableHandles"')
            expect(userMessage.content).toContain('"baseModelHash"')
        })
    })

    describe('on an unknown recipe type', () => {

        it('refuses with an UNSUPPORTED_RECIPE_TYPE answer before any LLM call', () => {
            const harness = aToolFactoryHarness({
                specialist: 'update_recipe',
                guiRequests: metadataFor(unspeccedMetadata),
                replies: [{text: 'never reached'}]
            })

            const result = harness.invoke({recipeId: unspeccedMetadata.id, instruction: 'edit'})

            expect(result).toMatchObject({ok: false, error: {code: 'UNSUPPORTED_RECIPE_TYPE'}})
            expect(harness.llm.receivedMessages).toEqual([])
        })
    })
})
