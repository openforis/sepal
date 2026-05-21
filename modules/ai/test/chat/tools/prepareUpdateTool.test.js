const {of, throwError} = require('rxjs')
const {prepareUpdateTool} = require('#mcp/chat/tools/prepareUpdateTool')
const {aFakeGuiRequests, read} = require('../builders')

describe('prepare_update tool', () => {

    const context = {clientId: 'c1', subscriptionId: 's1'}

    function aMosaicGuiResponse(overrides = {}) {
        return {
            id: 'r1',
            type: 'MOSAIC',
            name: 'Kenya',
            projectId: 'p1',
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
                sources: {dataSets: {LANDSAT: ['LANDSAT_9']}},
                sceneSelectionOptions: {type: 'ALL'},
                compositeOptions: {corrections: ['SR', 'BRDF']},
                aoi: {type: 'POLYGON', path: [[36.7, -1.4]]}
            },
            ...overrides
        }
    }

    describe('schema', () => {

        it('declares recipeId + focusPaths and NO instruction property', () => {
            const tool = prepareUpdateTool(aFakeGuiRequests())

            expect(tool.name).toBe('prepare_update')
            expect(typeof tool.description).toBe('string')
            expect(tool.parameters.type).toBe('object')
            expect(Object.keys(tool.parameters.properties).sort()).toEqual(['focusPaths', 'recipeId'])
            expect(tool.parameters.properties).not.toHaveProperty('instruction')
        })

        it('tells the caller to add for missing paths and replace/remove only for existing paths', () => {
            const description = prepareUpdateTool(aFakeGuiRequests()).description

            expect(description).toMatch(/missingPaths/)
            expect(description).toMatch(/existingPaths/)
            expect(description).toMatch(/add/)
            expect(description).toMatch(/replace/)
        })
    })

    describe('invocation', () => {

        it('issues a load-recipe GUI request for the requested recipeId', () => {
            const guiRequests = aFakeGuiRequests(() => of(aMosaicGuiResponse()))

            read(prepareUpdateTool(guiRequests).invoke$({recipeId: 'r1', focusPaths: ['/dates/targetDate']}, context))

            expect(guiRequests.requests).toEqual([{
                clientId: 'c1', subscriptionId: 's1', action: 'load-recipe', params: {recipeId: 'r1'}
            }])
        })

        it('returns {ok:true} carrying the loaded modelHash as baseModelHash', () => {
            const tool = prepareUpdateTool(aFakeGuiRequests(() => of(aMosaicGuiResponse({modelHash: 'h-current'}))))

            const result = read(tool.invoke$({recipeId: 'r1', focusPaths: ['/dates/targetDate']}, context))

            expect(result.ok).toBe(true)
            expect(result.data.baseModelHash).toBe('h-current')
        })

        it('echoes the requested focusPaths unchanged', () => {
            const tool = prepareUpdateTool(aFakeGuiRequests(() => of(aMosaicGuiResponse())))

            const result = read(tool.invoke$({recipeId: 'r1', focusPaths: ['/dates/targetDate']}, context))

            expect(result.data.focusPaths).toEqual(['/dates/targetDate'])
        })

        it('expands /dates/targetDate to the season-window companions (companions only, not the focus path)', () => {
            const tool = prepareUpdateTool(aFakeGuiRequests(() => of(aMosaicGuiResponse())))

            const result = read(tool.invoke$({recipeId: 'r1', focusPaths: ['/dates/targetDate']}, context))

            expect(result.data.dependentPaths.sort()).toEqual([
                '/dates/seasonEnd',
                '/dates/seasonStart'
            ])
            expect(result.data.dependentPaths).not.toContain('/dates/targetDate')
        })

        it('sets writablePaths to focusPaths union dependentPaths', () => {
            const tool = prepareUpdateTool(aFakeGuiRequests(() => of(aMosaicGuiResponse())))

            const result = read(tool.invoke$({recipeId: 'r1', focusPaths: ['/dates/targetDate']}, context))

            expect(result.data.writablePaths).toEqual(expect.arrayContaining([
                '/dates/targetDate',
                '/dates/seasonStart',
                '/dates/seasonEnd'
            ]))
            expect(result.data.writablePaths.sort()).toEqual([
                '/dates/seasonEnd',
                '/dates/seasonStart',
                '/dates/targetDate'
            ])
        })

        it('returns currentValues for every writable path from the effective model', () => {
            const tool = prepareUpdateTool(aFakeGuiRequests(() => of(aMosaicGuiResponse())))

            const result = read(tool.invoke$({recipeId: 'r1', focusPaths: ['/dates/targetDate']}, context))

            expect(Object.keys(result.data.currentValues).sort()).toEqual(result.data.writablePaths.sort())
            expect(result.data.currentValues['/dates/targetDate']).toBe('2024-07-02')
            expect(result.data.currentValues['/dates/seasonStart']).toBe('2024-01-01')
            expect(result.data.currentValues['/dates/seasonEnd']).toBe('2025-01-01')
        })

        it('sets a writable companion absent from the model to null rather than omitting it', () => {
            const tool = prepareUpdateTool(aFakeGuiRequests(() => of(aMosaicGuiResponse())))

            const result = read(tool.invoke$({recipeId: 'r1', focusPaths: ['/sources/dataSets']}, context))

            expect(result.data.writablePaths).toContain('/compositeOptions/includedCloudMasking')
            expect(result.data.currentValues['/compositeOptions/includedCloudMasking']).toBeNull()
        })

        describe('existingPaths / missingPaths — disambiguating null currentValues', () => {

            it('reports all season-window paths as existing when they are present in the model', () => {
                const tool = prepareUpdateTool(aFakeGuiRequests(() => of(aMosaicGuiResponse())))

                const result = read(tool.invoke$({recipeId: 'r1', focusPaths: ['/dates/targetDate']}, context))

                expect(result.data.existingPaths.sort()).toEqual(['/dates/seasonEnd', '/dates/seasonStart', '/dates/targetDate'])
                expect(result.data.missingPaths).toEqual([])
            })

            it('reports an absent writable companion as missing (not merely null) while present companions stay existing', () => {
                const tool = prepareUpdateTool(aFakeGuiRequests(() => of(aMosaicGuiResponse())))

                const result = read(tool.invoke$({recipeId: 'r1', focusPaths: ['/sources/dataSets']}, context))

                expect(result.data.missingPaths).toContain('/compositeOptions/includedCloudMasking')
                expect(result.data.existingPaths).toContain('/sources/dataSets')
                expect(result.data.existingPaths).not.toContain('/compositeOptions/includedCloudMasking')
            })

            it('partitions writablePaths exactly into existingPaths and missingPaths', () => {
                const tool = prepareUpdateTool(aFakeGuiRequests(() => of(aMosaicGuiResponse())))

                const result = read(tool.invoke$({recipeId: 'r1', focusPaths: ['/sources/dataSets']}, context))

                expect([...result.data.existingPaths, ...result.data.missingPaths].sort()).toEqual([...result.data.writablePaths].sort())
                expect(result.data.existingPaths.filter(path => result.data.missingPaths.includes(path))).toEqual([])
            })
        })

        it('returns a TOOL_FAILED envelope when the GUI request errors', () => {
            const tool = prepareUpdateTool(aFakeGuiRequests(() => throwError(() => new Error('boom'))))

            const result = read(tool.invoke$({recipeId: 'r1', focusPaths: ['/dates/targetDate']}, context))

            expect(result).toMatchObject({ok: false, error: {code: 'TOOL_FAILED'}})
        })

        it('propagates a malformed focus pointer as a TOOL_FAILED envelope', () => {
            const tool = prepareUpdateTool(aFakeGuiRequests(() => of(aMosaicGuiResponse())))

            const result = read(tool.invoke$({recipeId: 'r1', focusPaths: ['dates/targetDate']}, context))

            expect(result).toMatchObject({ok: false, error: {code: 'TOOL_FAILED'}})
        })
    })
})
