const {of} = require('rxjs')
const {aToolFactoryHarness, aFakeLlm, innerToolsImpl} = require('../../harness')
const {metadataFor, mosaicMetadata} = require('./fixtures')

// Local LM models (Qwen via LM Studio) often emit reasoning then end the turn
// with no visible content after a successful recipe_patch. The specialist's
// final answer is then empty (it caps after the stalls), and the deterministic
// fallback is a robotic "Applied N operations to recipe ...". One response-only
// summarizer pass turns the successful patch into user-facing prose before the
// deterministic fallback. Routing the fake LLM by tool-presence separates the
// specialist loop (always tool-bearing) from the tool-free summarizer call.
describe('update_recipe summarizes a successful patch when the specialist answers empty', () => {

    const patchCall = {id: 'tp1', name: 'recipe_patch', input: {
        recipeId: 'r1', baseModelHash: 'h1',
        operations: [{op: 'remove', path: '/sources/dataSets/SENTINEL_2'}]
    }}
    const successData = {summary: 'Applied 1 operation to recipe r1', modelHash: 'h2', invalidatedPaths: ['/sources/dataSets']}

    function patchInnerTools() {
        return innerToolsImpl(
            {recipe_patch: () => of({ok: true, data: successData})},
            [
                {name: 'prepare_update', description: 'Prepare.', parameters: {type: 'object', properties: {recipeId: {type: 'string'}, focusPaths: {type: 'array', items: {type: 'string'}}}}},
                {name: 'recipe_patch', description: 'Patch.', parameters: {type: 'object', properties: {recipeId: {type: 'string'}, baseModelHash: {type: 'string'}, operations: {type: 'array'}}}}
            ]
        )
    }

    // Specialist calls always carry tools; the summarizer call carries none.
    function aRoutingLlm({specialistReplies, summaryReplies}) {
        const specialist = aFakeLlm({replies: specialistReplies})
        const summary = aFakeLlm({replies: summaryReplies})
        return {
            get summaryRequests() { return summary.receivedRequests },
            respondTo$(request) {
                return (request.tools && request.tools.length)
                    ? specialist.respondTo$(request)
                    : summary.respondTo$(request)
            }
        }
    }

    function aHarness({specialistReplies, summaryReplies}) {
        const llm = aRoutingLlm({specialistReplies, summaryReplies})
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            innerTools: patchInnerTools(),
            guiRequests: metadataFor(mosaicMetadata),
            llm
        })
        return {harness, llm}
    }

    // patch applied, then empty rounds -> the specialist caps with no usable text.
    const patchThenEmpty = [{toolCalls: [patchCall]}, {text: ''}]

    it('uses the summarizer prose as the answer, not the deterministic fallback', () => {
        const {harness} = aHarness({
            specialistReplies: patchThenEmpty,
            summaryReplies: [{text: 'Updated the recipe to use Landsat only and tuned rendering.'}]
        })

        const result = harness.invoke({recipeId: 'r1', instruction: 'use only Landsat, speed up rendering'})

        expect(result).toEqual({ok: true, data: {answer: 'Updated the recipe to use Landsat only and tuned rendering.'}})
        expect(result.data.answer).not.toMatch(/Applied 1 operation/)
    })

    it('makes the summarizer call with no tools and reasoning disabled', () => {
        const {harness, llm} = aHarness({
            specialistReplies: patchThenEmpty,
            summaryReplies: [{text: 'Updated the recipe to use Landsat only.'}]
        })

        harness.invoke({recipeId: 'r1', instruction: 'use only Landsat'})

        expect(llm.summaryRequests).toHaveLength(1)
        expect(llm.summaryRequests[0].tools).toEqual([])
        expect(llm.summaryRequests[0].disableReasoning).toBe(true)
    })

    it('feeds the summarizer recipe labels rather than only raw recipe type ids', () => {
        const {harness, llm} = aHarness({
            specialistReplies: patchThenEmpty,
            summaryReplies: [{text: 'Updated the recipe to use Landsat only.'}]
        })

        harness.invoke({recipeId: 'r1', instruction: 'use only Landsat'})

        const summaryUserText = llm.summaryRequests[0].messages[1].content
        expect(summaryUserText).toContain('recipeType: Optical Mosaic')
        expect(summaryUserText).toContain('valueLabels:')
        expect(summaryUserText).toContain('SENTINEL_2(Sentinel-2)')
        expect(summaryUserText).not.toContain('recipeType: MOSAIC')
    })

    it('feeds the summarizer label-enriched applied changes plus the raw operations for grounding', () => {
        const {harness, llm} = aHarness({
            specialistReplies: [{toolCalls: [{id: 'tp1', name: 'recipe_patch', input: {
                recipeId: 'r1', baseModelHash: 'h1',
                operations: [{op: 'replace', path: '/compositeOptions/includedCloudMasking', value: ['landsatCFMask']}]
            }}]}, {text: ''}],
            summaryReplies: [{text: 'Updated cloud masking.'}]
        })

        harness.invoke({recipeId: 'r1', instruction: 'use Landsat CFMask only'})

        const summaryUserText = llm.summaryRequests[0].messages[1].content
        expect(summaryUserText).toContain('appliedChanges:')
        expect(summaryUserText).toContain('Landsat CFMask')
        expect(summaryUserText).toContain('appliedOperations:')
    })

    it('falls back to the deterministic generic answer when the summarizer is empty', () => {
        const {harness} = aHarness({
            specialistReplies: patchThenEmpty,
            summaryReplies: [{text: ''}]
        })

        const result = harness.invoke({recipeId: 'r1', instruction: 'use only Landsat'})

        expect(result).toEqual({ok: true, data: {answer: 'Applied 1 operation to recipe r1'}})
    })

    it('does not summarize when the specialist already produced a non-empty answer', () => {
        const {harness, llm} = aHarness({
            specialistReplies: [{toolCalls: [patchCall]}, {text: 'Removed Sentinel-2 from the sources.'}],
            summaryReplies: [{text: 'should never be used'}]
        })

        const result = harness.invoke({recipeId: 'r1', instruction: 'use only Landsat'})

        expect(result).toEqual({ok: true, data: {answer: 'Removed Sentinel-2 from the sources.'}})
        expect(llm.summaryRequests).toHaveLength(0)
    })
})
