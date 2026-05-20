const {aToolFactoryHarness} = require('../../harness')
const {metadataFor, mosaicMetadata, unspeccedMetadata} = require('./fixtures')

describe('update_recipe per-type prompt assembly', () => {

    it('on a MOSAIC recipe, the system prompt names load_for_update, carries MOSAIC edit guidance, and omits the full JSON schema', () => {
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            guiRequests: metadataFor(mosaicMetadata)
        })

        harness.invoke({recipeId: 'r-mosaic', instruction: 'edit'})

        const systemPrompt = harness.llm.receivedMessages[0][0].content
        expect(systemPrompt).toMatch(/update specialist/i)
        expect(systemPrompt).toMatch(/MOSAIC/)
        expect(systemPrompt).toMatch(/Edit guidance:/i)
        expect(systemPrompt).toContain('load_for_update')
        expect(systemPrompt).not.toContain('recipe_load')
        expect(systemPrompt).not.toMatch(/```json/)
        expect(systemPrompt).not.toMatch(/Choose when:/i)
        expect(systemPrompt).not.toMatch(/Use cases:/i)
    })

    it('on an unknown recipe type, the system prompt is the base frame (no per-type edit guidance)', () => {
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            guiRequests: metadataFor(unspeccedMetadata)
        })

        harness.invoke({recipeId: 'r-other', instruction: 'edit'})

        const systemPrompt = harness.llm.receivedMessages[0][0].content
        expect(systemPrompt).toMatch(/update specialist/i)
        expect(systemPrompt).not.toMatch(/Edit guidance:/i)
        expect(systemPrompt).not.toMatch(/```json/)
    })
})
