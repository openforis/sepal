const {of} = require('rxjs')
const {createToolRegistry} = require('#mcp/chat/tools/registry')
const {prepareUpdateTool} = require('#mcp/chat/tools/prepareUpdateTool')
const {recipePatchTool} = require('#mcp/chat/tools/recipePatchTool')
const {aToolFactoryHarness, aFakeGuiRequests, aRecordingBus} = require('../../harness')

// A broad "render as quickly as possible" request resolves to a set of
// speed-oriented focusPaths the specialist hands to the REAL prepare_update.
// This pins the live flow: the work packet returned to the specialist carries
// currentValues + writablePaths covering every speed focus path. The model's
// choice of paths is scripted (prepare_update never sees the instruction), so
// this is a guard on the live preparation flow, not a check that the model
// "read" the manual.
describe('update_recipe prepares a live speed-oriented work packet', () => {

    const speedFocusPaths = [
        '/compositeOptions/tileOverlap',
        '/compositeOptions/orbitOverlap',
        '/compositeOptions/cloudBuffer',
        '/compositeOptions/corrections',
        '/compositeOptions/filters',
        '/compositeOptions/holes',
        '/dates/yearsBefore',
        '/dates/yearsAfter'
    ]

    // An expensive starting model: KEEP overlaps, a non-zero cloudBuffer, BRDF on,
    // hole-prevention, an extra filter and a wide multi-year window — so a speed
    // patch is a real optimization, not a no-op.
    const mosaicModel = {
        dates: {type: 'YEARLY_TIME_SCAN', targetDate: '2024-07-02', seasonStart: '2022-01-01', seasonEnd: '2025-01-01', yearsBefore: 2, yearsAfter: 2},
        sources: {dataSets: {LANDSAT: ['LANDSAT_9']}},
        sceneSelectionOptions: {type: 'ALL'},
        compositeOptions: {tileOverlap: 'KEEP', orbitOverlap: 'KEEP', cloudBuffer: 600, holes: 'PREVENT', corrections: ['BRDF'], brdfMultiplier: 1, filters: [{type: 'SHADOW', percentile: 20}]}
    }

    // Moves every speed-relevant field off its expensive baseline.
    const speedOptimizationOps = [
        {op: 'replace', path: '/compositeOptions/cloudBuffer', value: 0},
        {op: 'replace', path: '/compositeOptions/tileOverlap', value: 'QUICK_REMOVE'},
        {op: 'replace', path: '/compositeOptions/holes', value: 'ALLOW'},
        {op: 'replace', path: '/compositeOptions/corrections', value: []},
        {op: 'replace', path: '/dates/yearsBefore', value: 0},
        {op: 'replace', path: '/dates/yearsAfter', value: 0}
    ]

    const patchResult = {summary: 'Tuned the mosaic for speed.', modelHash: 'h-new', invalidatedPaths: speedFocusPaths}

    function guiRequestsForMosaic() {
        return aFakeGuiRequests(request => {
            if (request.action === 'recipe-metadata') return of({id: 'r1', type: 'MOSAIC', name: 'Kenya', projectId: 'p1'})
            if (request.action === 'load-recipe') return of({id: 'r1', type: 'MOSAIC', modelHash: 'h-base', model: mosaicModel})
            if (request.action === 'recipe-patch') return of(patchResult)
            return of({})
        })
    }

    function patchRequestsFor(guiRequests, recipeId) {
        return guiRequests.requests.filter(request => request.action === 'recipe-patch' && request.params.recipeId === recipeId)
    }

    function realInnerTools(guiRequests) {
        return createToolRegistry({
            tools: [prepareUpdateTool(guiRequests), recipePatchTool(guiRequests)],
            bus: aRecordingBus()
        })
    }

    function preparedPacketSeenBySpecialist(harness) {
        const toolMessage = harness.llm.receivedMessages[1].find(message => message.role === 'tool')
        return toolMessage.toolResults.find(result => result.toolName === 'prepare_update').result
    }

    it('returns currentValues and writablePaths covering every speed focus path', () => {
        const guiRequests = guiRequestsForMosaic()
        const prepareCall = {id: 'tu1', name: 'prepare_update', input: {recipeId: 'r1', focusPaths: speedFocusPaths}}
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            guiRequests,
            innerTools: realInnerTools(guiRequests),
            replies: [
                {toolCalls: [prepareCall]},
                {text: 'Tuned the mosaic for speed.'}
            ]
        })

        harness.invoke({recipeId: 'r1', instruction: 'Make the mosaic render as quickly as possible'})

        const packet = preparedPacketSeenBySpecialist(harness)
        expect(packet.ok).toBe(true)
        expect(packet.data.writablePaths).toEqual(expect.arrayContaining(speedFocusPaths))
        speedFocusPaths.forEach(path => expect(packet.data.currentValues).toHaveProperty([path]))
        // The packet reflects the expensive baseline the specialist must tune down.
        expect(packet.data.currentValues['/compositeOptions/cloudBuffer']).toBe(600)
        expect(packet.data.currentValues['/compositeOptions/tileOverlap']).toBe('KEEP')
    })

    // Full prepare_update -> recipe_patch loop through the REAL inner tools: the
    // scripted specialist prepares, then patches over the writablePaths using the
    // packet's baseModelHash, then answers. The recipe_patch tool must forward a
    // recipe-patch GUI request and the outer specialist envelope must report
    // success — i.e. the whole live loop completed end-to-end.
    it('forwards a recipe-patch request and completes with a success envelope', () => {
        const guiRequests = guiRequestsForMosaic()
        const prepareCall = {id: 'tu1', name: 'prepare_update', input: {recipeId: 'r1', focusPaths: speedFocusPaths}}
        const patchCall = {id: 'tp1', name: 'recipe_patch', input: {
            recipeId: 'r1',
            baseModelHash: 'h-base',
            operations: speedOptimizationOps
        }}
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            guiRequests,
            innerTools: realInnerTools(guiRequests),
            replies: [
                {toolCalls: [prepareCall]},
                {toolCalls: [patchCall]},
                {text: 'Tuned the mosaic for speed.'}
            ]
        })

        const result = harness.invoke({recipeId: 'r1', instruction: 'Make the mosaic render as quickly as possible'})

        const patchRequests = patchRequestsFor(guiRequests, 'r1')
        expect(patchRequests).toHaveLength(1)
        // The forwarded patch is a real optimization: it lowers cloudBuffer off
        // its expensive (600) baseline, not a no-op rewrite of the same value.
        expect(mosaicModel.compositeOptions.cloudBuffer).not.toBe(0)
        expect(patchRequests[0].params.operations).toContainEqual({op: 'replace', path: '/compositeOptions/cloudBuffer', value: 0})
        expect(result).toMatchObject({ok: true, data: {answer: expect.any(String)}})
    })
})
