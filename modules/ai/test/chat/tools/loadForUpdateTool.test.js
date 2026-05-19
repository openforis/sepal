const {concat, of, throwError, toArray} = require('rxjs')
const {loadForUpdateTool} = require('#mcp/chat/tools/loadForUpdateTool')
const {emitChannel, guiAction, isChannelEmission} = require('#mcp/chat/channelEvents')
const {aFakeGuiRequests, read} = require('../builders')

describe('load_for_update tool', () => {

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

        it('declares the documented parameters (recipeId + instruction both required)', () => {
            const tool = loadForUpdateTool(aFakeGuiRequests())

            expect(tool.name).toBe('load_for_update')
            expect(typeof tool.description).toBe('string')
            expect(tool.parameters).toEqual({
                type: 'object',
                properties: {
                    recipeId: {type: 'string'},
                    instruction: {type: 'string'}
                },
                required: ['recipeId', 'instruction'],
                additionalProperties: false
            })
        })
    })

    describe('invocation', () => {

        it('issues a load-recipe GUI request for the requested recipeId', () => {
            const guiRequests = aFakeGuiRequests(() => of(aMosaicGuiResponse()))

            read(loadForUpdateTool(guiRequests).invoke$({recipeId: 'r1', instruction: 'change target date'}, context))

            expect(guiRequests.requests).toEqual([{
                clientId: 'c1', subscriptionId: 's1', action: 'load-recipe', params: {recipeId: 'r1'}
            }])
        })

        it('returns {ok:true, data} carrying baseModelHash from the loaded recipe', () => {
            const tool = loadForUpdateTool(aFakeGuiRequests(() => of(aMosaicGuiResponse({modelHash: 'h-current'}))))

            const result = read(tool.invoke$({recipeId: 'r1', instruction: 'change target date'}, context))

            expect(result.ok).toBe(true)
            expect(result.data.baseModelHash).toBe('h-current')
        })

        it('returns the MOSAIC date closure when the instruction is target-date intent', () => {
            const tool = loadForUpdateTool(aFakeGuiRequests(() => of(aMosaicGuiResponse())))

            const result = read(tool.invoke$({recipeId: 'r1', instruction: 'change the target date to 2026-06-01'}, context))

            expect(result.data.intent).toBe('dateWindow')
            expect(result.data.currentValues['/dates/targetDate']).toBe('2024-07-02')
            expect(result.data.dependentPaths).toContain('/dates/targetDate')
            expect(result.data.guidance.join('\n')).toMatch(/seasonStart/)
        })

        it('returns the broad closure when the instruction does not match a deterministic intent', () => {
            const tool = loadForUpdateTool(aFakeGuiRequests(() => of(aMosaicGuiResponse())))

            const result = read(tool.invoke$({recipeId: 'r1', instruction: 'make this recipe better'}, context))

            expect(result.data.intent).toBe('broad')
            expect(result.data.dependentPaths).toEqual([])
            expect(Object.keys(result.data.currentValues)).toContain('/dates')
        })

        it('projects the stored model through toEffectiveModel before computing the closure (passes effective shape, not stored)', () => {
            const stored = aMosaicGuiResponse()
            // Stored has BRDF -> brdfMultiplier survives. Add a dormant tuning value
            // (sentinel2CloudProbabilityMaxCloudProbability with no SENTINEL_2 source)
            // and assert it is stripped before the broad closure sees the model.
            stored.model.compositeOptions = {
                ...stored.model.compositeOptions,
                includedCloudMasking: ['sentinel2CloudProbability', 'sepalCloudScore'],
                sentinel2CloudProbabilityMaxCloudProbability: 30
            }
            const tool = loadForUpdateTool(aFakeGuiRequests(() => of(stored)))

            const result = read(tool.invoke$({recipeId: 'r1', instruction: 'tune things'}, context))

            expect(result.data.currentValues['/compositeOptions']).not.toHaveProperty('sentinel2CloudProbabilityMaxCloudProbability')
            expect(result.data.currentValues['/compositeOptions'].includedCloudMasking).not.toContain('sentinel2CloudProbability')
        })

        it('does not return the full stored model when a deterministic closure is available', () => {
            const tool = loadForUpdateTool(aFakeGuiRequests(() => of(aMosaicGuiResponse())))

            const result = read(tool.invoke$({recipeId: 'r1', instruction: 'change target date'}, context))

            expect(result.data).not.toHaveProperty('model')
            expect(Object.keys(result.data.currentValues).every(k => k.startsWith('/dates/'))).toBe(true)
        })
    })

    describe('channel-emission passthrough', () => {

        function captureEmissions(observable) {
            const emissions = []
            observable.subscribe({
                next: v => emissions.push(v),
                error: e => { throw e }
            })
            return emissions
        }

        it('passes the GUI bridge channel emission through unchanged, then yields the envelope', () => {
            const channelEmission = emitChannel(guiAction({requestId: 'req-1', action: 'load-recipe', params: {recipeId: 'r1'}}))
            const guiRequests = aFakeGuiRequests(() => concat(of(channelEmission), of(aMosaicGuiResponse())))

            const emissions = captureEmissions(loadForUpdateTool(guiRequests).invoke$({recipeId: 'r1', instruction: 'edit'}, context))

            expect(emissions).toHaveLength(2)
            expect(isChannelEmission(emissions[0])).toBe(true)
            expect(emissions[0]).toBe(channelEmission)
            expect(emissions[1].ok).toBe(true)
            expect(emissions[1].data.baseModelHash).toBe('h-base')
        })

        it('does not emit a spurious envelope for the channel event (regression: plain map would treat the channel emission as a recipe)', () => {
            const channelEmission = emitChannel(guiAction({requestId: 'req-1', action: 'load-recipe', params: {recipeId: 'r1'}}))
            const guiRequests = aFakeGuiRequests(() => concat(of(channelEmission), of(aMosaicGuiResponse())))

            const emissions = captureEmissions(loadForUpdateTool(guiRequests).invoke$({recipeId: 'r1', instruction: 'edit'}, context))

            const envelopes = emissions.filter(value => !isChannelEmission(value))
            expect(envelopes).toHaveLength(1)
            expect(envelopes[0].ok).toBe(true)
        })
    })

    describe('error propagation', () => {

        it('wraps an unstructured GUI failure as {ok:false, error: TOOL_FAILED}', () => {
            const tool = loadForUpdateTool(aFakeGuiRequests(() => throwError(() => new Error('GUI gone'))))

            const result = read(tool.invoke$({recipeId: 'r1', instruction: 'edit'}, context))

            expect(result).toEqual({ok: false, error: {code: 'TOOL_FAILED', message: 'GUI gone'}})
        })

        it('propagates a structured RECIPE_NOT_FOUND code from the bridge', () => {
            const codedError = Object.assign(new Error('Recipe not found: r1'), {code: 'RECIPE_NOT_FOUND'})
            const tool = loadForUpdateTool(aFakeGuiRequests(() => throwError(() => codedError)))

            const result = read(tool.invoke$({recipeId: 'r1', instruction: 'edit'}, context))

            expect(result).toEqual({ok: false, error: {code: 'RECIPE_NOT_FOUND', message: 'Recipe not found: r1'}})
        })

        it('returns an UNSUPPORTED_RECIPE_TYPE error when the recipe type has no spec', () => {
            const stored = {id: 'r1', type: 'NOT_IN_REGISTRY', modelHash: 'h', model: {}}
            const tool = loadForUpdateTool(aFakeGuiRequests(() => of(stored)))

            const result = read(tool.invoke$({recipeId: 'r1', instruction: 'edit'}, context))

            expect(result).toEqual({
                ok: false,
                error: {code: 'UNSUPPORTED_RECIPE_TYPE', message: expect.stringContaining('NOT_IN_REGISTRY')}
            })
        })

        it('returns a MISSING_MODEL_HASH error when the GUI response lacks modelHash', () => {
            const stored = {id: 'r1', type: 'MOSAIC', model: {dates: {}}}
            const tool = loadForUpdateTool(aFakeGuiRequests(() => of(stored)))

            const result = read(tool.invoke$({recipeId: 'r1', instruction: 'edit'}, context))

            expect(result.ok).toBe(false)
            expect(result.error.code).toBe('MISSING_MODEL_HASH')
        })
    })
})
