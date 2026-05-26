const {of, throwError} = require('rxjs')
const {createRecipeValuesTool} = require('#mcp/chat/specialists/createRecipe/createRecipeValuesTool')
const {aFakeGuiRequests, expectNoHandlePathsIn, read} = require('../../builders')

const context = {clientId: 'c1', subscriptionId: 's1'}

describe('create_recipe_values tool', () => {

    describe('schema', () => {

        it('declares recipeType + projectId + name + writableHandles + values, with no JSON Pointer / patch fields', () => {
            const tool = createRecipeValuesTool(aFakeGuiRequests())

            expect(tool.name).toBe('create_recipe_values')
            expect(typeof tool.description).toBe('string')
            expect(Object.keys(tool.parameters.properties).sort()).toEqual([
                'name', 'projectId', 'recipeType', 'values', 'writableHandles'
            ])
            expect(tool.parameters.required.sort()).toEqual(['recipeType', 'values', 'writableHandles'])
            const surface = `${tool.description} ${JSON.stringify(tool.parameters)}`
            expect(surface).not.toMatch(/JSON Pointer/i)
            expect(surface).not.toMatch(/RFC 6902/i)
            expect(surface).not.toMatch(/JSON Patch/i)
        })
    })

    describe('preflight (no GUI call on bad input)', () => {

        it('rejects an unknown recipeType with UNSUPPORTED_RECIPE_TYPE and does not call GUI', () => {
            const {handler, calls} = aRecordingGui()
            const tool = createRecipeValuesTool(aFakeGuiRequests(handler))

            const result = read(tool.invoke$(aValidCall({recipeType: 'NOT_REAL'}), context))

            expect(result).toMatchObject({ok: false, error: {code: 'UNSUPPORTED_RECIPE_TYPE'}})
            expect(calls).toEqual([])
        })

        it('rejects a value whose handle is not in writableHandles, in handle terms, before any GUI work', () => {
            const {handler, calls} = aRecordingGui()
            const tool = createRecipeValuesTool(aFakeGuiRequests(handler))

            const result = read(tool.invoke$(aValidCall({
                writableHandles: ['aoi'],
                values: {aoi: aPolygonAoi(), cloudBuffer: 600}
            }), context))

            expect(result).toMatchObject({
                ok: false,
                error: {code: 'HANDLE_OUT_OF_SCOPE', handles: ['cloudBuffer']}
            })
            expect(calls).toEqual([])
        })

        it('rejects an unknown handle in handle terms, before any GUI work', () => {
            const {handler, calls} = aRecordingGui()
            const tool = createRecipeValuesTool(aFakeGuiRequests(handler))

            const result = read(tool.invoke$(aValidCall({
                writableHandles: ['aoi', 'whoIsThis'],
                values: {aoi: aPolygonAoi(), whoIsThis: 42}
            }), context))

            expect(result).toMatchObject({
                ok: false,
                error: {code: 'UNKNOWN_HANDLE', handles: ['whoIsThis']}
            })
            expect(calls).toEqual([])
        })
    })

    describe('applicability check before any GUI work', () => {

        it('rejects an inapplicable selector item with APPLICABILITY_VIOLATION when the scope handle does not satisfy it', () => {
            const {handler, calls} = aRecordingGui()
            const tool = createRecipeValuesTool(aFakeGuiRequests(handler))

            // datasets defaults to LANDSAT-only, so sentinel2CloudScorePlus is inapplicable
            const result = read(tool.invoke$(aValidCall({
                writableHandles: ['aoi', 'cloudMethods'],
                values: {
                    aoi: aPolygonAoi(),
                    cloudMethods: ['sepalCloudScore', 'landsatCFMask', 'sentinel2CloudScorePlus']
                }
            }), context))

            expect(result.ok).toBe(false)
            expect(result.error.code).toBe('APPLICABILITY_VIOLATION')
            expect(result.error.handleErrors).toEqual(expect.arrayContaining([
                expect.objectContaining({handle: 'cloudMethods', message: expect.stringMatching(/Sentinel-2/)})
            ]))
            expect(calls).toEqual([])
        })
    })

    describe('validation before GUI work', () => {

        it('returns VALIDATION_FAILED with handle-keyed errors when defaults+values fail spec.validate, before any GUI call', () => {
            const {handler, calls} = aRecordingGui()
            const tool = createRecipeValuesTool(aFakeGuiRequests(handler))

            // targetDate before the Landsat 4 epoch — rule violation that survives toEffectiveModel.
            const result = read(tool.invoke$(aValidCall({
                writableHandles: ['aoi', 'targetDate'],
                values: {aoi: aPolygonAoi(), targetDate: '1970-01-01'}
            }), context))

            expect(result.ok).toBe(false)
            expect(result.error.code).toBe('VALIDATION_FAILED')
            expect(result.error.handleErrors).toEqual(expect.arrayContaining([
                expect.objectContaining({handle: 'targetDate'})
            ]))
            expect(calls).toEqual([])
        })

        it('returns VALIDATION_FAILED with a handle-keyed aoi error when the user-required aoi is missing, before any GUI call', () => {
            const {handler, calls} = aRecordingGui()
            const tool = createRecipeValuesTool(aFakeGuiRequests(handler))

            const result = read(tool.invoke$(aValidCall({
                writableHandles: ['aoi'],
                values: {}
            }), context))

            expect(result.ok).toBe(false)
            expect(result.error.code).toBe('VALIDATION_FAILED')
            expect(result.error.handleErrors).toEqual(expect.arrayContaining([
                expect.objectContaining({handle: 'aoi', message: expect.stringMatching(/required.*aoi/i)})
            ]))
            expect(calls).toEqual([])
        })

        it('VALIDATION_FAILED handle-keyed errors do not leak JSON Pointer paths', () => {
            const tool = createRecipeValuesTool(aFakeGuiRequests(aRecordingGui().handler))

            const result = read(tool.invoke$(aValidCall({
                writableHandles: ['aoi', 'targetDate'],
                values: {aoi: aPolygonAoi(), targetDate: '1970-01-01'}
            }), context))

            expectNoHandlePathsIn(result, {recipeType: 'MOSAIC'})
        })
    })

    describe('GUI create-recipe call (when values valid)', () => {

        it('submits the effective model (defaults + handle values, projected through toEffectiveModel) to GUI create-recipe', () => {
            const {handler, calls} = aRecordingGui({
                createResponse: {summary: 'ok', recipeId: 'new-r1', name: 'Kenya', type: 'MOSAIC', projectId: 'p1'}
            })
            const tool = createRecipeValuesTool(aFakeGuiRequests(handler))

            read(tool.invoke$(aValidCall({
                writableHandles: ['aoi', 'cloudBuffer'],
                values: {aoi: aPolygonAoi(), cloudBuffer: 120}
            }), context))

            const createCall = calls.find(call => call.action === 'create-recipe')
            expect(createCall).toBeDefined()
            expect(createCall.params.type).toBe('MOSAIC')
            expect(createCall.params.model.compositeOptions.cloudBuffer).toBe(120)
            expect(createCall.params.model.aoi).toEqual(aPolygonAoi())
        })

        it('forwards projectId and name verbatim to GUI create-recipe', () => {
            const {handler, calls} = aRecordingGui({
                createResponse: {summary: 'ok', recipeId: 'new-r2'}
            })
            const tool = createRecipeValuesTool(aFakeGuiRequests(handler))

            read(tool.invoke$(aValidCall({
                projectId: 'project-x',
                name: 'My new mosaic',
                writableHandles: ['aoi'],
                values: {aoi: aPolygonAoi()}
            }), context))

            const createCall = calls.find(call => call.action === 'create-recipe')
            expect(createCall.params).toMatchObject({
                type: 'MOSAIC',
                name: 'My new mosaic',
                projectId: 'project-x'
            })
        })

        it('does not pass workflow-bound or unknown fields to GUI create-recipe', () => {
            const {handler, calls} = aRecordingGui({
                createResponse: {summary: 'ok', recipeId: 'new-r3'}
            })
            const tool = createRecipeValuesTool(aFakeGuiRequests(handler))

            read(tool.invoke$(aValidCall({writableHandles: ['aoi'], values: {aoi: aPolygonAoi()}}), context))

            const createCall = calls.find(call => call.action === 'create-recipe')
            expect(createCall.params).not.toHaveProperty('writableHandles')
            expect(createCall.params).not.toHaveProperty('values')
            expect(createCall.params).not.toHaveProperty('baseModelHash')
        })

        it('returns a success envelope carrying recipe identity from the GUI response', () => {
            const {handler} = aRecordingGui({
                createResponse: {summary: 'created', recipeId: 'new-r4', name: 'Kenya', type: 'MOSAIC', projectId: 'p1'}
            })
            const tool = createRecipeValuesTool(aFakeGuiRequests(handler))

            const result = read(tool.invoke$(aValidCall({
                projectId: 'p1', name: 'Kenya',
                writableHandles: ['aoi'], values: {aoi: aPolygonAoi()}
            }), context))

            expect(result.ok).toBe(true)
            expect(result.data).toMatchObject({
                recipeId: 'new-r4',
                type: 'MOSAIC',
                name: 'Kenya',
                projectId: 'p1'
            })
        })
    })

    describe('GUI create-recipe error handling', () => {

        it('maps GUI VALIDATION_FAILED path errors back to handles, keyed by handle', () => {
            const {handler} = aRecordingGui({
                createResponse: () => throwError(() => Object.assign(new Error('Validation failed'), {
                    code: 'VALIDATION_FAILED',
                    errors: [{path: '/dates/targetDate', message: 'must be on or after 1982-08-22', rule: 'targetDateAfterEpoch'}]
                }))
            })
            const tool = createRecipeValuesTool(aFakeGuiRequests(handler))

            const result = read(tool.invoke$(aValidCall({
                writableHandles: ['aoi'],
                values: {aoi: aPolygonAoi()}
            }), context))

            expect(result.ok).toBe(false)
            expect(result.error.code).toBe('VALIDATION_FAILED')
            expect(result.error.handleErrors).toEqual(expect.arrayContaining([
                expect.objectContaining({handle: 'targetDate', message: expect.stringMatching(/1982-08-22/)})
            ]))
        })

        it('does not leak JSON Pointer paths in the failure envelope; handleErrors is the model-facing surface', () => {
            const {handler} = aRecordingGui({
                createResponse: () => throwError(() => Object.assign(new Error('Validation failed'), {
                    code: 'VALIDATION_FAILED',
                    errors: [{path: '/dates/targetDate', message: 'must be on or after 1982-08-22'}]
                }))
            })
            const tool = createRecipeValuesTool(aFakeGuiRequests(handler))

            const result = read(tool.invoke$(aValidCall({
                writableHandles: ['aoi'],
                values: {aoi: aPolygonAoi()}
            }), context))

            expectNoHandlePathsIn(result, {recipeType: 'MOSAIC'})
        })

        it('passes through a generic GUI failure code/message without inventing handleErrors', () => {
            const {handler} = aRecordingGui({
                createResponse: () => throwError(() => Object.assign(new Error('boom'), {code: 'PERSIST_FAILED'}))
            })
            const tool = createRecipeValuesTool(aFakeGuiRequests(handler))

            const result = read(tool.invoke$(aValidCall({
                writableHandles: ['aoi'],
                values: {aoi: aPolygonAoi()}
            }), context))

            expect(result.ok).toBe(false)
            expect(result.error).toMatchObject({code: 'PERSIST_FAILED', message: 'boom'})
            expect(result.error.handleErrors).toBeUndefined()
        })
    })
})

// Records every GUI request and returns a configurable response to create-recipe.
// Defaults to a generic success so error-path tests can swap in throwError.
function aRecordingGui({createResponse} = {}) {
    const calls = []
    const handler = request => {
        calls.push(request)
        if (request.action === 'create-recipe') {
            if (typeof createResponse === 'function') return createResponse(request)
            if (createResponse !== undefined) return of(createResponse)
            return of({summary: 'created', recipeId: 'gen-id', type: request.params.type, name: request.params.name, projectId: request.params.projectId})
        }
        return of({})
    }
    return {handler, calls}
}

function aValidCall({recipeType = 'MOSAIC', projectId, name, writableHandles, values} = {}) {
    return {
        recipeType,
        ...(projectId !== undefined ? {projectId} : {}),
        ...(name !== undefined ? {name} : {}),
        writableHandles: writableHandles || ['aoi'],
        values: values || {aoi: aPolygonAoi()}
    }
}

function aPolygonAoi() {
    return {type: 'POLYGON', path: [[36.7, -1.4], [37.0, -1.4], [37.0, -1.1]]}
}
