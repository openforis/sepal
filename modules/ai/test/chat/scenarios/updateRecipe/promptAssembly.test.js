const {aToolFactoryHarness} = require('../../harness')
const {metadataFor, mosaicMetadata, unspeccedMetadata} = require('./fixtures')

describe('update_recipe per-type prompt assembly', () => {

    function systemPromptFor(metadata) {
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            guiRequests: metadataFor(metadata)
        })
        harness.invoke({recipeId: 'r-mosaic', instruction: 'edit'})
        return harness.llm.receivedMessages[0][0].content
    }

    describe('on a MOSAIC recipe', () => {

        it('drives the workflow with prepare_update, not load_for_update', () => {
            const systemPrompt = systemPromptFor(mosaicMetadata)

            expect(systemPrompt).toMatch(/update specialist/i)
            expect(systemPrompt).toContain('prepare_update')
            expect(systemPrompt).not.toMatch(/load_for_update.*first/i)
        })

        it('carries the per-type edit guidance bullets', () => {
            const systemPrompt = systemPromptFor(mosaicMetadata)

            expect(systemPrompt).toMatch(/Recipe type: Optical Mosaic/)
            expect(systemPrompt).not.toMatch(/Recipe: MOSAIC/)
            expect(systemPrompt).toMatch(/Edit guidance:/i)
        })

        it('tells the specialist to add for missingPaths and replace for existingPaths', () => {
            const systemPrompt = systemPromptFor(mosaicMetadata)

            expect(systemPrompt).toMatch(/missingPaths/)
            expect(systemPrompt).toMatch(/existingPaths/)
            expect(systemPrompt).toMatch(/\badd\b/)
            expect(systemPrompt).toMatch(/\breplace\b/)
        })

        it('injects the generated update manual after the edit guidance (a path the guidance bullets do not carry)', () => {
            const systemPrompt = systemPromptFor(mosaicMetadata)

            expect(systemPrompt).toContain('/compositeOptions/tileOverlap')
            expect(systemPrompt.indexOf('Edit guidance:')).toBeLessThan(systemPrompt.indexOf('/compositeOptions/tileOverlap'))
        })

        it('carries the corrected fast-render levers with the manual, base prompt first, schema still omitted', () => {
            const systemPrompt = systemPromptFor(mosaicMetadata)

            expect(systemPrompt).toMatch(/Warnings:/)
            expect(systemPrompt).toMatch(/cloudBuffer.*(expensive|distance|buffer)|BRDF.*(expensive|slow|fail)/i)
            expect(systemPrompt).not.toMatch(/```json/)
            expect(systemPrompt).toMatch(/update specialist/i)
            expect(systemPrompt.indexOf('update specialist')).toBeLessThan(systemPrompt.indexOf('Warnings:'))
        })

        it('omits the full JSON schema and bare recipe_load', () => {
            const systemPrompt = systemPromptFor(mosaicMetadata)

            expect(systemPrompt).not.toContain('recipe_load')
            expect(systemPrompt).not.toMatch(/```json/)
            expect(systemPrompt).not.toMatch(/Choose when:/i)
            expect(systemPrompt).not.toMatch(/Use cases:/i)
        })
    })

    describe('on an unknown recipe type', () => {

        it('falls back to the base frame with no per-type edit guidance or schema', () => {
            const systemPrompt = systemPromptFor(unspeccedMetadata)

            expect(systemPrompt).toMatch(/update specialist/i)
            expect(systemPrompt).not.toMatch(/Edit guidance:/i)
            expect(systemPrompt).not.toMatch(/```json/)
        })
    })
})
