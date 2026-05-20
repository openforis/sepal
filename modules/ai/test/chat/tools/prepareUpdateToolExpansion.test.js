const {of} = require('rxjs')
const {prepareUpdateTool} = require('#mcp/chat/tools/prepareUpdateTool')
const {aFakeGuiRequests, read} = require('../builders')

// The chat-shaping expansion (focusPaths -> dependentPaths -> writablePaths)
// lives in the tool. The recipe lib only supplies the coupling data; these
// cover the tool's de-dup and no-companions branches.
describe('prepare_update tool — companion expansion', () => {

    const context = {clientId: 'c1', subscriptionId: 's1'}

    function aMosaicGuiResponse(overrides = {}) {
        return {
            id: 'r1',
            type: 'MOSAIC',
            modelHash: 'h-base',
            model: {
                dates: {
                    type: 'YEARLY_TIME_SCAN',
                    targetDate: '2024-07-02',
                    seasonStart: '2024-01-01',
                    seasonEnd: '2025-01-01',
                    yearsBefore: 0,
                    yearsAfter: 0
                },
                sources: {dataSets: {LANDSAT: ['LANDSAT_9']}}
            },
            ...overrides
        }
    }

    function packet(focusPaths) {
        const tool = prepareUpdateTool(aFakeGuiRequests(() => of(aMosaicGuiResponse())))
        return read(tool.invoke$({recipeId: 'r1', focusPaths}, context)).data
    }

    it('returns no dependentPaths for a focus path with no recipe-coupled companions', () => {
        const data = packet(['/dates/yearsBefore'])

        expect(data.dependentPaths).toEqual([])
        expect(data.writablePaths).toEqual(['/dates/yearsBefore'])
    })

    it('de-duplicates companions shared across repeated focus paths', () => {
        const data = packet(['/dates/targetDate', '/dates/targetDate'])

        expect(data.dependentPaths.sort()).toEqual([
            '/dates/seasonEnd',
            '/dates/seasonStart'
        ])
    })

    it('rejects a recipe type with no recipe spec rather than preparing an empty packet', () => {
        const tool = prepareUpdateTool(aFakeGuiRequests(() => of(aMosaicGuiResponse({type: 'UNKNOWN'}))))

        const result = read(tool.invoke$({recipeId: 'r1', focusPaths: ['/dates/targetDate']}, context))

        expect(result).toMatchObject({ok: false, error: {code: 'UNSUPPORTED_RECIPE_TYPE'}})
    })
})
