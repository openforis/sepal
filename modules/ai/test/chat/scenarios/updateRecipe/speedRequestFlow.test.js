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

    const mosaicModel = {
        dates: {type: 'YEARLY_TIME_SCAN', targetDate: '2024-07-02', seasonStart: '2024-01-01', seasonEnd: '2025-01-01', yearsBefore: 0, yearsAfter: 0},
        sources: {dataSets: {LANDSAT: ['LANDSAT_9']}},
        sceneSelectionOptions: {type: 'ALL'},
        compositeOptions: {tileOverlap: 'KEEP', orbitOverlap: 'KEEP', cloudBuffer: 0, holes: 'ALLOW', corrections: ['SR'], filters: []}
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
    })
})
