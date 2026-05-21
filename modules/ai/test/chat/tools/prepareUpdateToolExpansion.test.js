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

    // A focus on a child of /sources/dataSets (removing one source group) must
    // pull in the same companions the parent path couples to — corrections and
    // cloud masking — or the specialist patches the removal blind and validation
    // (which knows the coupling) rejects it. Preparation and validation must agree.
    describe('focusing a child of a coupled parent path', () => {

        function twoSourceMosaic() {
            return aMosaicGuiResponse({
                model: {
                    dates: {type: 'YEARLY_TIME_SCAN', targetDate: '2024-07-02', seasonStart: '2024-01-01', seasonEnd: '2025-01-01'},
                    sources: {dataSets: {LANDSAT: ['LANDSAT_9'], SENTINEL_2: ['SENTINEL_2']}},
                    sceneSelectionOptions: {type: 'ALL'},
                    compositeOptions: {corrections: ['CALIBRATE'], includedCloudMasking: ['sentinel2CloudScorePlus']}
                }
            })
        }

        function childPacket() {
            const tool = prepareUpdateTool(aFakeGuiRequests(() => of(twoSourceMosaic())))
            return read(tool.invoke$({recipeId: 'r1', focusPaths: ['/sources/dataSets/SENTINEL_2']}, context)).data
        }

        it('couples the corrections and cloud-masking companions keyed on the parent path', () => {
            const data = childPacket()

            expect(data.dependentPaths).toEqual(expect.arrayContaining([
                '/compositeOptions/corrections',
                '/compositeOptions/includedCloudMasking'
            ]))
        })

        it('names the coupling rules in dependencyFacts', () => {
            const facts = JSON.stringify(childPacket().dependencyFacts)

            expect(facts).toMatch(/calibrateRequiresMultipleSources/)
            expect(facts).toMatch(/cloudMaskingMethodAvailability/)
        })

        it('does not list the focus path or its parent as their own dependent', () => {
            const data = childPacket()

            expect(data.dependentPaths).not.toContain('/sources/dataSets/SENTINEL_2')
            expect(data.dependentPaths).not.toContain('/sources/dataSets')
        })
    })

    // Symmetry the other way: focusing an ancestor must match a constraint keyed
    // on a descendant of it. Focusing /compositeOptions reaches the corrections
    // constraint keyed on /compositeOptions/corrections.
    it('matches a descendant-keyed constraint when focusing an ancestor path', () => {
        const tool = prepareUpdateTool(aFakeGuiRequests(() => of(aMosaicGuiResponse({
            model: {
                sources: {dataSets: {LANDSAT: ['LANDSAT_9'], SENTINEL_2: ['SENTINEL_2']}},
                sceneSelectionOptions: {type: 'ALL'},
                compositeOptions: {corrections: ['CALIBRATE']}
            }
        }))))

        const data = read(tool.invoke$({recipeId: 'r1', focusPaths: ['/compositeOptions']}, context)).data

        expect(data.dependentPaths).toEqual(expect.arrayContaining(['/sources/dataSets']))
    })
})
