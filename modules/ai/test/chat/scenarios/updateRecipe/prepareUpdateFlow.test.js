const {of} = require('rxjs')
const {createToolRegistry} = require('#mcp/chat/tools/registry')
const {prepareUpdateTool} = require('#mcp/chat/tools/prepareUpdateTool')
const {recipePatchTool} = require('#mcp/chat/tools/recipePatchTool')
const {aToolFactoryHarness, aFakeGuiRequests, aRecordingBus} = require('../../harness')

// Live-integration anchor for the migrated update specialist: prepare_update is
// wired into its inner registry, reachable end-to-end, and the work packet the
// REAL tool computes from the REAL recipe reaches the specialist's context. The
// packet's write scope must cover the paths the recipe's constraints couple to
// the focus — which a double could not produce. The full prepare->patch->envelope
// outcome flow is pinned separately in envelope.test.js (with tool doubles).
describe('update_recipe obtains a live prepare_update work packet', () => {

    const mosaicModel = {
        dates: {type: 'YEARLY_TIME_SCAN', targetDate: '2024-07-02', seasonStart: '2024-01-01', seasonEnd: '2025-01-01', yearsBefore: 0, yearsAfter: 0},
        sources: {dataSets: {LANDSAT: ['LANDSAT_9']}},
        sceneSelectionOptions: {type: 'ALL'},
        compositeOptions: {corrections: ['SR']}
    }

    function guiRequestsForMosaic() {
        return aFakeGuiRequests(request => {
            if (request.action === 'recipe-metadata') return of({id: 'r1', type: 'MOSAIC', name: 'Kenya', projectId: 'p1'})
            if (request.action === 'load-recipe') return of({id: 'r1', type: 'MOSAIC', modelHash: 'h-base', model: mosaicModel})
            return of({})
        })
    }

    function realInnerTools(guiRequests) {
        return createToolRegistry({
            tools: [prepareUpdateTool(guiRequests), recipePatchTool(guiRequests)],
            bus: aRecordingBus()
        })
    }

    // The packet the specialist saw = the prepare_update result fed back into the
    // model's next turn (the tool message on round 2's input).
    function preparedPacketSeenBySpecialist(harness) {
        const toolMessage = harness.llm.receivedMessages[1].find(message => message.role === 'tool')
        return toolMessage.toolResults.find(result => result.toolName === 'prepare_update').result
    }

    it('expands the focus into the constraint-coupled writable scope', () => {
        const guiRequests = guiRequestsForMosaic()
        const prepareCall = {id: 'tu1', name: 'prepare_update', input: {recipeId: 'r1', focusPaths: ['/sources/dataSets']}}
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            guiRequests,
            innerTools: realInnerTools(guiRequests),
            replies: [
                {toolCalls: [prepareCall]},
                {text: 'Looked at the source coupling.'}
            ]
        })

        harness.invoke({recipeId: 'r1', instruction: 'add Sentinel-2 to the sources'})

        const packet = preparedPacketSeenBySpecialist(harness)
        expect(packet.ok).toBe(true)
        expect(packet.data.writablePaths).toEqual(expect.arrayContaining([
            '/sources/dataSets',
            '/compositeOptions/corrections',
            '/sceneSelectionOptions/type'
        ]))
        expect(packet.data.dependentPaths).toEqual(expect.arrayContaining([
            '/compositeOptions/corrections',
            '/sceneSelectionOptions/type'
        ]))
    })

    // Adding a cloud-masking method requires its schema-conditional companion in
    // the SAME patch (sentinel2CloudProbability needs its max-cloud-probability
    // threshold) or the post-apply model fails validation. The live packet must
    // therefore hand the specialist both paths in one work packet so it can patch
    // method + threshold in one attempt.
    it('hands the specialist the method and its schema-required threshold when focusing includedCloudMasking', () => {
        const guiRequests = guiRequestsForMosaic()
        const prepareCall = {id: 'tu1', name: 'prepare_update', input: {recipeId: 'r1', focusPaths: ['/compositeOptions/includedCloudMasking']}}
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            guiRequests,
            innerTools: realInnerTools(guiRequests),
            replies: [
                {toolCalls: [prepareCall]},
                {text: 'Prepared cloud-masking edit.'}
            ]
        })

        harness.invoke({recipeId: 'r1', instruction: 'add the Sentinel-2 cloud probability mask'})

        const packet = preparedPacketSeenBySpecialist(harness)
        expect(packet.ok).toBe(true)
        expect(packet.data.writablePaths).toEqual(expect.arrayContaining([
            '/compositeOptions/includedCloudMasking',
            '/compositeOptions/sentinel2CloudProbabilityMaxCloudProbability'
        ]))
        // The threshold companion's current value is carried (null when unset) so
        // the specialist knows it must supply one in the patch.
        expect(packet.data.currentValues).toHaveProperty('/compositeOptions/sentinel2CloudProbabilityMaxCloudProbability')
    })
})
