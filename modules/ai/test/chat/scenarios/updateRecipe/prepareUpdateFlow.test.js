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

    // Regression: the model once tried to drop a cloud-masking method with a
    // value-name path (/compositeOptions/includedCloudMasking/sentinel2CloudScorePlus)
    // and to remove the required corrections field. The live packet must hint
    // both as required config arrays so the planner replaces them wholesale.
    it('hints includedCloudMasking as a required config array with its live length', () => {
        const model = {
            ...mosaicModel,
            sources: {dataSets: {LANDSAT: ['LANDSAT_9'], SENTINEL_2: ['SENTINEL_2']}},
            compositeOptions: {corrections: ['SR'], includedCloudMasking: ['sentinel2CloudScorePlus', 'landsatCFMask']}
        }
        const guiRequests = aFakeGuiRequests(request => {
            if (request.action === 'recipe-metadata') return of({id: 'r1', type: 'MOSAIC', name: 'Kenya', projectId: 'p1'})
            if (request.action === 'load-recipe') return of({id: 'r1', type: 'MOSAIC', modelHash: 'h-base', model})
            return of({})
        })
        const prepareCall = {id: 'tu1', name: 'prepare_update', input: {recipeId: 'r1', focusPaths: ['/compositeOptions/includedCloudMasking']}}
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            guiRequests,
            innerTools: realInnerTools(guiRequests),
            replies: [
                {toolCalls: [prepareCall]},
                {text: 'Considered the cloud-masking change.'}
            ]
        })

        harness.invoke({recipeId: 'r1', instruction: 'drop Sentinel-2 Cloud Score+'})

        const packet = preparedPacketSeenBySpecialist(harness)
        expect(packet.data.pathHints['/compositeOptions/includedCloudMasking']).toEqual({
            valueKind: 'array',
            arrayKind: 'config',
            arrayLength: 2,
            required: true
        })
    })

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

    // The fixture model has no includedCloudMasking, so adding the Sentinel-2
    // cloud-probability mask + its required threshold are NEW paths. The live
    // packet must mark them missing so the specialist emits `add`, not `replace`
    // (which would PATCH_APPLY_FAILED and waste a round).
    // Removing one source group is a focus on a child of /sources/dataSets. The
    // live packet must still surface the companions keyed on the parent path
    // (corrections, cloud masking) so the specialist patches the coupled fields
    // in the same attempt rather than having validation reject a lone removal.
    it('surfaces the parent-keyed source companions when focusing a child source path', () => {
        const guiRequests = guiRequestsForMosaic()
        const prepareCall = {id: 'tu1', name: 'prepare_update', input: {recipeId: 'r1', focusPaths: ['/sources/dataSets/SENTINEL_2']}}
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            guiRequests,
            innerTools: realInnerTools(guiRequests),
            replies: [
                {toolCalls: [prepareCall]},
                {text: 'Considered the source removal coupling.'}
            ]
        })

        harness.invoke({recipeId: 'r1', instruction: 'use only Landsat'})

        const packet = preparedPacketSeenBySpecialist(harness)
        expect(packet.ok).toBe(true)
        expect(packet.data.dependentPaths).toEqual(expect.arrayContaining([
            '/compositeOptions/corrections',
            '/compositeOptions/includedCloudMasking'
        ]))
    })

    it('marks the new cloud-masking method and its threshold as missingPaths in the live packet', () => {
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
        expect(packet.data.missingPaths).toEqual(expect.arrayContaining([
            '/compositeOptions/includedCloudMasking',
            '/compositeOptions/sentinel2CloudProbabilityMaxCloudProbability'
        ]))
    })
})
