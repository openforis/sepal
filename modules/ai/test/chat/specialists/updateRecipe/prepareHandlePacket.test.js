const {of, throwError} = require('rxjs')
const {prepareHandlePacket$} = require('#mcp/chat/specialists/updateRecipe/prepareHandlePacket')
const {aFakeGuiRequests, read} = require('../../builders')

const context = {clientId: 'c1', subscriptionId: 's1'}

function aMosaicRecipe(overrides = {}) {
    return {
        id: 'r1',
        type: 'MOSAIC',
        modelHash: 'h-base',
        model: {
            dates: {type: 'YEARLY_TIME_SCAN', targetDate: '2024-07-02', seasonStart: '2024-01-01', seasonEnd: '2025-01-01', yearsBefore: 0, yearsAfter: 0},
            sources: {cloudPercentageThreshold: 75, dataSets: {LANDSAT: ['LANDSAT_9']}},
            sceneSelectionOptions: {type: 'ALL', targetDateWeight: 0},
            compositeOptions: {
                corrections: ['SR', 'BRDF'],
                brdfMultiplier: 4,
                filters: [],
                orbitOverlap: 'KEEP',
                tileOverlap: 'QUICK_REMOVE',
                includedCloudMasking: ['sepalCloudScore', 'landsatCFMask'],
                landsatCFMaskCloudMasking: 'MODERATE',
                landsatCFMaskCloudShadowMasking: 'MODERATE',
                landsatCFMaskCirrusMasking: 'MODERATE',
                landsatCFMaskDilatedCloud: 'REMOVE',
                sepalCloudScoreMaxCloudProbability: 30,
                cloudBuffer: 0,
                holes: 'ALLOW',
                snowMasking: 'ON',
                compose: 'MEDOID'
            }
        },
        ...overrides
    }
}

function loadRecipe(recipe) {
    return aFakeGuiRequests(request => {
        if (request.action === 'load-recipe') return of(recipe)
        return of({})
    })
}

describe('prepareHandlePacket$', () => {

    it('issues a load-recipe GUI request for the requested recipeId', () => {
        const guiRequests = loadRecipe(aMosaicRecipe())
        read(prepareHandlePacket$({guiRequests, recipeId: 'r1', recipeType: 'MOSAIC', pickedHandles: ['targetDate'], context}))

        expect(guiRequests.requests).toEqual([{
            clientId: 'c1', subscriptionId: 's1', action: 'load-recipe', params: {recipeId: 'r1'}
        }])
    })

    it('carries the recipe modelHash through as baseModelHash', () => {
        const guiRequests = loadRecipe(aMosaicRecipe({modelHash: 'h-current'}))

        const result = read(prepareHandlePacket$({guiRequests, recipeId: 'r1', recipeType: 'MOSAIC', pickedHandles: ['targetDate'], context}))

        expect(result.ok).toBe(true)
        expect(result.data.baseModelHash).toBe('h-current')
    })

    it('returns the picked handles unchanged', () => {
        const guiRequests = loadRecipe(aMosaicRecipe())

        const result = read(prepareHandlePacket$({guiRequests, recipeId: 'r1', recipeType: 'MOSAIC', pickedHandles: ['targetDate'], context}))

        expect(result.data.pickedHandles).toEqual(['targetDate'])
    })

    it('keys the fields object by handle and includes current value, description, and value guidance', () => {
        const guiRequests = loadRecipe(aMosaicRecipe())

        const result = read(prepareHandlePacket$({guiRequests, recipeId: 'r1', recipeType: 'MOSAIC', pickedHandles: ['targetDate'], context}))

        const field = result.data.fields.targetDate
        expect(field.currentValue).toBe('2024-07-02')
        expect(typeof field.description).toBe('string')
        expect(field.description.length).toBeGreaterThan(0)
        expect(typeof field.valueGuidance).toBe('string')
    })

    it('uses null currentValue for a handle whose path is absent from the model', () => {
        const recipe = aMosaicRecipe()
        delete recipe.model.compositeOptions.sentinel2CloudProbabilityMaxCloudProbability
        const guiRequests = loadRecipe(recipe)

        const result = read(prepareHandlePacket$({guiRequests, recipeId: 'r1', recipeType: 'MOSAIC', pickedHandles: ['s2CloudProbabilityMax'], context}))

        expect(result.data.fields.s2CloudProbabilityMax.currentValue).toBeNull()
    })

    describe('dependency expansion via recipe constraints', () => {

        it('expands targetDate into seasonStart and seasonEnd dependent handles', () => {
            const guiRequests = loadRecipe(aMosaicRecipe())

            const result = read(prepareHandlePacket$({guiRequests, recipeId: 'r1', recipeType: 'MOSAIC', pickedHandles: ['targetDate'], context}))

            expect(result.data.dependentHandles.sort()).toEqual(['seasonEnd', 'seasonStart'])
            expect(result.data.writableHandles.sort()).toEqual(['seasonEnd', 'seasonStart', 'targetDate'])
        })

        it('expands datasets into corrections and sceneSelection dependent handles', () => {
            const guiRequests = loadRecipe(aMosaicRecipe())

            const result = read(prepareHandlePacket$({guiRequests, recipeId: 'r1', recipeType: 'MOSAIC', pickedHandles: ['datasets'], context}))

            expect(result.data.dependentHandles).toEqual(expect.arrayContaining(['corrections', 'sceneSelection']))
            expect(result.data.writableHandles).toEqual(expect.arrayContaining(['datasets', 'corrections', 'sceneSelection']))
        })

        it('emits a dependencyFacts entry per dependent handle naming the constraint that pulled it in', () => {
            const guiRequests = loadRecipe(aMosaicRecipe())

            const result = read(prepareHandlePacket$({guiRequests, recipeId: 'r1', recipeType: 'MOSAIC', pickedHandles: ['targetDate'], context}))

            expect(result.data.dependencyFacts).toEqual(expect.arrayContaining([
                expect.objectContaining({handle: 'seasonStart', constraint: 'seasonStartWindow'}),
                expect.objectContaining({handle: 'seasonEnd', constraint: 'seasonEndWindow'})
            ]))
        })

        it('summarizes validation rules in handle-friendly form (name + description)', () => {
            const guiRequests = loadRecipe(aMosaicRecipe())

            const result = read(prepareHandlePacket$({guiRequests, recipeId: 'r1', recipeType: 'MOSAIC', pickedHandles: ['datasets'], context}))

            expect(result.data.validationRules).toEqual(expect.arrayContaining([
                expect.objectContaining({name: 'multipleSourcesRequireCalibrate', description: expect.any(String)})
            ]))
        })
    })

    describe('writableHandles enforcement', () => {

        it('limits writableHandles to picked + deterministic dependents', () => {
            const guiRequests = loadRecipe(aMosaicRecipe())

            const result = read(prepareHandlePacket$({guiRequests, recipeId: 'r1', recipeType: 'MOSAIC', pickedHandles: ['cloudBuffer'], context}))

            expect(result.data.writableHandles).toEqual(['cloudBuffer'])
            expect(result.data.dependentHandles).toEqual([])
        })
    })

    describe('packet hides JSON Pointer paths from the LLM contract', () => {

        it('keys fields by handle name, not path', () => {
            const guiRequests = loadRecipe(aMosaicRecipe())

            const result = read(prepareHandlePacket$({guiRequests, recipeId: 'r1', recipeType: 'MOSAIC', pickedHandles: ['cloudMethods'], context}))

            for (const key of Object.keys(result.data.fields)) {
                expect(key).not.toMatch(/^\//)
            }
        })

        it('omits internal-path properties from the prepared packet shape', () => {
            const guiRequests = loadRecipe(aMosaicRecipe())

            const result = read(prepareHandlePacket$({guiRequests, recipeId: 'r1', recipeType: 'MOSAIC', pickedHandles: ['cloudMethods'], context}))

            expect(result.data).not.toHaveProperty('writablePaths')
            expect(result.data).not.toHaveProperty('focusPaths')
            expect(result.data).not.toHaveProperty('currentValues')
            expect(result.data).not.toHaveProperty('pathHints')
        })

        it('field entries do not expose the internal path or pointer hints', () => {
            const guiRequests = loadRecipe(aMosaicRecipe())

            const result = read(prepareHandlePacket$({guiRequests, recipeId: 'r1', recipeType: 'MOSAIC', pickedHandles: ['targetDate'], context}))

            for (const field of Object.values(result.data.fields)) {
                expect(field).not.toHaveProperty('path')
                expect(field).not.toHaveProperty('pathHint')
            }
        })

        it('dependencyFacts entries are keyed by handle, not by path', () => {
            const guiRequests = loadRecipe(aMosaicRecipe())

            const result = read(prepareHandlePacket$({guiRequests, recipeId: 'r1', recipeType: 'MOSAIC', pickedHandles: ['targetDate'], context}))

            for (const fact of result.data.dependencyFacts) {
                expect(fact).toHaveProperty('handle')
                expect(fact).not.toHaveProperty('path')
            }
        })
    })

    it('returns a TOOL_FAILED envelope when GUI load-recipe errors', () => {
        const guiRequests = aFakeGuiRequests(() => throwError(() => new Error('boom')))

        const result = read(prepareHandlePacket$({guiRequests, recipeId: 'r1', recipeType: 'MOSAIC', pickedHandles: ['targetDate'], context}))

        expect(result).toMatchObject({ok: false, error: {code: 'TOOL_FAILED'}})
    })

    it('returns an UNKNOWN_HANDLE envelope when any picked handle is not in the recipe catalog', () => {
        const guiRequests = loadRecipe(aMosaicRecipe())

        const result = read(prepareHandlePacket$({guiRequests, recipeId: 'r1', recipeType: 'MOSAIC', pickedHandles: ['targetDate', 'bogus'], context}))

        expect(result.ok).toBe(false)
        expect(result.error.code).toBe('UNKNOWN_HANDLE')
        expect(result.error.handles).toEqual(['bogus'])
    })
})
