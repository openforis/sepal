import {concat, of, throwError, toArray} from 'rxjs'

import {emitChannel, guiAction, isChannelEmission} from '#mcp/chat/channelEvents'
import {updateRecipeValuesTool} from '#mcp/chat/specialists/updateRecipe/updateRecipeValuesTool'

import {aFakeGuiRequests, read} from '../../builders.js'

const context = {clientId: 'c1', subscriptionId: 's1'}

function aGuiHandler({recipe, patchResponse}) {
    const calls = []
    const handler = request => {
        calls.push(request)
        if (request.action === 'load-recipe') return of(recipe)
        if (request.action === 'recipe-patch') {
            if (typeof patchResponse === 'function') return patchResponse(request)
            return of(patchResponse)
        }
        return of({})
    }
    return {handler, calls}
}

function aMosaicRecipe(overrides = {}) {
    return {
        id: 'r1',
        type: 'MOSAIC',
        modelHash: 'h-base',
        model: {
            dates: {type: 'YEARLY_TIME_SCAN', targetDate: '2024-07-02', seasonStart: '2024-01-01', seasonEnd: '2025-01-01', yearsBefore: 0, yearsAfter: 0},
            sources: {cloudPercentageThreshold: 75, dataSets: {LANDSAT: ['LANDSAT_9'], SENTINEL_2: ['SENTINEL_2']}},
            sceneSelectionOptions: {type: 'ALL', targetDateWeight: 0},
            compositeOptions: {
                corrections: ['CALIBRATE', 'BRDF'],
                brdfMultiplier: 4,
                filters: [],
                orbitOverlap: 'KEEP',
                tileOverlap: 'QUICK_REMOVE',
                includedCloudMasking: ['sepalCloudScore', 'landsatCFMask', 'sentinel2CloudScorePlus'],
                landsatCFMaskCloudMasking: 'MODERATE',
                landsatCFMaskCloudShadowMasking: 'MODERATE',
                landsatCFMaskCirrusMasking: 'MODERATE',
                landsatCFMaskDilatedCloud: 'REMOVE',
                sepalCloudScoreMaxCloudProbability: 30,
                sentinel2CloudScorePlusBand: 'cs_cdf',
                sentinel2CloudScorePlusMaxCloudProbability: 45,
                cloudBuffer: 0,
                holes: 'ALLOW',
                snowMasking: 'ON',
                compose: 'MEDOID'
            },
            aoi: {type: 'POLYGON', path: [[36.7, -1.4], [36.8, -1.4], [36.8, -1.3]]}
        },
        ...overrides
    }
}

describe('update_recipe_values tool', () => {

    describe('schema', () => {

        it('declares recipeId + baseModelHash + writableHandles + values, with no JSON Pointer fields', () => {
            const tool = updateRecipeValuesTool(aFakeGuiRequests())

            expect(tool.name).toBe('update_recipe_values')
            expect(typeof tool.description).toBe('string')
            expect(Object.keys(tool.parameters.properties).sort()).toEqual([
                'baseModelHash', 'recipeId', 'values', 'writableHandles'
            ])
            const description = `${tool.description} ${JSON.stringify(tool.parameters)}`
            expect(description).not.toMatch(/JSON Pointer/i)
            expect(description).not.toMatch(/RFC 6902/i)
            expect(description).not.toMatch(/JSON Patch/i)
        })
    })

    it('passes the load-recipe GUI channel emission through and applies only the load-recipe response', async () => {
        const recipe = aMosaicRecipe()
        const guiRequests = aFakeGuiRequests(request => {
            if (request.action === 'load-recipe') return concat(
                of(emitChannel(guiAction({requestId: 'req-load', action: 'load-recipe', params: {recipeId: 'r1'}}))),
                of(recipe)
            )
            if (request.action === 'recipe-patch') return of({summary: 'ok', modelHash: 'h-next', invalidatedPaths: []})
            return of({})
        })
        const tool = updateRecipeValuesTool(guiRequests)

        const emissions = await tool.invoke$({
            recipeId: 'r1', baseModelHash: 'h-base',
            writableHandles: ['cloudBuffer'],
            values: {cloudBuffer: 120}
        }, context).pipe(toArray()).toPromise()

        expect(emissions).toHaveLength(2)
        expect(isChannelEmission(emissions[0])).toBe(true)
        expect(emissions[1]).toMatchObject({ok: true, data: {appliedHandles: ['cloudBuffer']}})
    })

    describe('applicability check before any GUI work', () => {

        it('rejects an inapplicable selector item with APPLICABILITY_VIOLATION when the scope handle does not satisfy it', () => {
            const recipe = aMosaicRecipe()
            recipe.model.sources.dataSets = {LANDSAT: ['LANDSAT_9']}
            const {handler, calls} = aGuiHandler({recipe})
            const tool = updateRecipeValuesTool(aFakeGuiRequests(handler))

            const result = read(tool.invoke$({
                recipeId: 'r1', baseModelHash: 'h-base',
                writableHandles: ['cloudMethods'],
                values: {cloudMethods: ['sepalCloudScore', 'landsatCFMask', 'sentinel2CloudScorePlus']}
            }, context))

            expect(result.ok).toBe(false)
            expect(result.error.code).toBe('APPLICABILITY_VIOLATION')
            expect(result.error.handleErrors).toEqual([
                expect.objectContaining({handle: 'cloudMethods'})
            ])
            expect(calls.some(request => request.action === 'recipe-patch')).toBe(false)
        })

        it('accepts the same item when the scope handle is being set in the same call to satisfy the requirement', () => {
            const recipe = aMosaicRecipe()
            recipe.model.sources.dataSets = {LANDSAT: ['LANDSAT_9']}
            recipe.model.compositeOptions.corrections = ['SR']
            const {handler} = aGuiHandler({recipe, patchResponse: {summary: 'ok', modelHash: 'h-next', invalidatedPaths: []}})
            const tool = updateRecipeValuesTool(aFakeGuiRequests(handler))

            const result = read(tool.invoke$({
                recipeId: 'r1', baseModelHash: 'h-base',
                writableHandles: ['datasets', 'cloudMethods', 'corrections'],
                values: {
                    datasets: {LANDSAT: ['LANDSAT_9'], SENTINEL_2: ['SENTINEL_2']},
                    cloudMethods: ['sepalCloudScore', 'landsatCFMask', 'sentinel2CloudScorePlus'],
                    corrections: ['CALIBRATE']
                }
            }, context))

            expect(result.ok).toBe(true)
        })

        it('names the conflicting item label and the missing scope keys without leaking internal paths', () => {
            const recipe = aMosaicRecipe()
            recipe.model.sources.dataSets = {LANDSAT: ['LANDSAT_9']}
            const {handler} = aGuiHandler({recipe})
            const tool = updateRecipeValuesTool(aFakeGuiRequests(handler))

            const result = read(tool.invoke$({
                recipeId: 'r1', baseModelHash: 'h-base',
                writableHandles: ['cloudMethods'],
                values: {cloudMethods: ['sepalCloudScore', 'sentinel2CloudScorePlus']}
            }, context))

            const handleError = result.error.handleErrors.find(entry => entry.handle === 'cloudMethods')
            expect(handleError.message).toMatch(/sentinel-2 cloud score\+/i)
            expect(handleError.message).toMatch(/sentinel-2|datasets/i)
            expect(JSON.stringify(result.error)).not.toMatch(/\/(compositeOptions|sources)\//)
        })
    })

    describe('writableHandles enforcement', () => {

        it('rejects a value whose handle is not in writableHandles, in handle terms', () => {
            const {handler, calls} = aGuiHandler({recipe: aMosaicRecipe()})
            const tool = updateRecipeValuesTool(aFakeGuiRequests(handler))

            const result = read(tool.invoke$({
                recipeId: 'r1', baseModelHash: 'h-base',
                writableHandles: ['cloudMethods'],
                values: {cloudMethods: ['sepalCloudScore'], cloudBuffer: 120}
            }, context))

            expect(result.ok).toBe(false)
            expect(result.error.code).toBe('HANDLE_OUT_OF_SCOPE')
            expect(result.error.handles).toEqual(['cloudBuffer'])
            // Rejected before any GUI work: no load-recipe, no recipe-patch.
            expect(calls).toEqual([])
        })

        it('rejects an unknown handle in handle terms', () => {
            const tool = updateRecipeValuesTool(aFakeGuiRequests(() => of(aMosaicRecipe())))

            const result = read(tool.invoke$({
                recipeId: 'r1', baseModelHash: 'h-base',
                writableHandles: ['cloudMethods', 'bogusHandle'],
                values: {bogusHandle: 'x'}
            }, context))

            expect(result.ok).toBe(false)
            expect(result.error.code).toBe('UNKNOWN_HANDLE')
            expect(result.error.handles).toEqual(['bogusHandle'])
        })
    })

    describe('mapping handles to internal patch ops', () => {

        it('generates a replace op against the handle\'s internal path when the value differs from the current effective value', () => {
            const {handler, calls} = aGuiHandler({recipe: aMosaicRecipe(), patchResponse: {summary: 'ok', modelHash: 'h-next', invalidatedPaths: []}})
            const tool = updateRecipeValuesTool(aFakeGuiRequests(handler))

            read(tool.invoke$({
                recipeId: 'r1', baseModelHash: 'h-base',
                writableHandles: ['targetDate'],
                values: {targetDate: '2023-07-02'}
            }, context))

            const patch = calls.find(request => request.action === 'recipe-patch')
            expect(patch.params.baseModelHash).toBe('h-base')
            expect(patch.params.operations).toEqual([
                {op: 'replace', path: '/dates/targetDate', value: '2023-07-02'}
            ])
        })

        it('omits an op when the requested value equals the current effective value', () => {
            const {handler, calls} = aGuiHandler({recipe: aMosaicRecipe(), patchResponse: {summary: 'noop', modelHash: 'h-base', invalidatedPaths: []}})
            const tool = updateRecipeValuesTool(aFakeGuiRequests(handler))

            read(tool.invoke$({
                recipeId: 'r1', baseModelHash: 'h-base',
                writableHandles: ['cloudBuffer', 'snowMasking'],
                values: {cloudBuffer: 0, snowMasking: 'ON'}
            }, context))

            const patch = calls.find(request => request.action === 'recipe-patch')
            expect(patch).toBeUndefined()
        })

        it('generates an add op when the handle\'s path is absent from the current effective model (path-survives-projection variant)', () => {
            // brdfMultiplier is only addressable when corrections contains BRDF.
            // Set the same in the same call so projection survives; the path
            // was deleted from the stored model so the patch must be 'add' not
            // 'replace'.
            const recipe = aMosaicRecipe()
            recipe.model.sources.dataSets = {LANDSAT: ['LANDSAT_9']}
            recipe.model.compositeOptions.corrections = ['BRDF']
            delete recipe.model.compositeOptions.brdfMultiplier
            const {handler, calls} = aGuiHandler({recipe, patchResponse: {summary: 'ok', modelHash: 'h-next', invalidatedPaths: []}})
            const tool = updateRecipeValuesTool(aFakeGuiRequests(handler))

            read(tool.invoke$({
                recipeId: 'r1', baseModelHash: 'h-base',
                writableHandles: ['brdfMultiplier'],
                values: {brdfMultiplier: 4}
            }, context))

            const patch = calls.find(request => request.action === 'recipe-patch')
            expect(patch.params.operations).toEqual([
                {op: 'add', path: '/compositeOptions/brdfMultiplier', value: 4}
            ])
        })
    })

    describe('projection-survival guard (inactive companion handles)', () => {

        it('rejects a companion value with INACTIVE_VALUE when its selector item is inactive and the call is not also activating it', () => {
            // s2CloudProbabilityMax is a companion of cloudMethods item sentinel2CloudProbability.
            // Recipe has cloudMethods=['sepalCloudScore','landsatCFMask','sentinel2CloudScorePlus']
            // — sentinel2CloudProbability NOT active. Setting the companion alone would be
            // stripped by toEffectiveModel; reject before any GUI work.
            const {handler, calls} = aGuiHandler({recipe: aMosaicRecipe()})
            const tool = updateRecipeValuesTool(aFakeGuiRequests(handler))

            const result = read(tool.invoke$({
                recipeId: 'r1', baseModelHash: 'h-base',
                writableHandles: ['s2CloudProbabilityMax'],
                values: {s2CloudProbabilityMax: 60}
            }, context))

            expect(result).toMatchObject({
                ok: false,
                error: {
                    code: 'INACTIVE_VALUE',
                    handleErrors: [expect.objectContaining({handle: 's2CloudProbabilityMax'})]
                }
            })
            expect(calls.find(request => request.action === 'recipe-patch')).toBeUndefined()
        })

        it('allows the same companion when the same atomic call also sets the selector to include the activating item', () => {
            // Setting s2CloudProbabilityMax is only valid when cloudMethods includes
            // sentinel2CloudProbability. Same-call activation must work — the companion
            // never activates the item on its own, but a values call that does both is
            // a single atomic transition the projection accepts.
            const {handler, calls} = aGuiHandler({
                recipe: aMosaicRecipe(),
                patchResponse: {summary: 'ok', modelHash: 'h-next', invalidatedPaths: []}
            })
            const tool = updateRecipeValuesTool(aFakeGuiRequests(handler))

            const result = read(tool.invoke$({
                recipeId: 'r1', baseModelHash: 'h-base',
                writableHandles: ['cloudMethods', 's2CloudProbabilityMax'],
                values: {
                    cloudMethods: ['sepalCloudScore', 'landsatCFMask', 'sentinel2CloudScorePlus', 'sentinel2CloudProbability'],
                    s2CloudProbabilityMax: 60
                }
            }, context))

            expect(result.ok).toBe(true)
            const patch = calls.find(request => request.action === 'recipe-patch')
            const paths = patch.params.operations.map(op => op.path)
            expect(paths).toEqual(expect.arrayContaining([
                '/compositeOptions/includedCloudMasking',
                '/compositeOptions/sentinel2CloudProbabilityMaxCloudProbability'
            ]))
        })

        it('INACTIVE_VALUE message names the handle label and never leaks JSON Pointer paths', () => {
            const {handler} = aGuiHandler({recipe: aMosaicRecipe()})
            const tool = updateRecipeValuesTool(aFakeGuiRequests(handler))

            const result = read(tool.invoke$({
                recipeId: 'r1', baseModelHash: 'h-base',
                writableHandles: ['s2CloudProbabilityMax'],
                values: {s2CloudProbabilityMax: 60}
            }, context))

            const [handleError] = result.error.handleErrors
            expect(handleError.handle).toBe('s2CloudProbabilityMax')
            expect(handleError.message).toMatch(/Sentinel-2 Cloud Probability threshold/)
            expect(JSON.stringify(result.error)).not.toMatch(/\/compositeOptions\//)
        })
    })

    describe('whole-value semantics for config arrays and objects', () => {

        it('replaces the whole cloudMethods array as one op, no index or remove-by-value', () => {
            const {handler, calls} = aGuiHandler({recipe: aMosaicRecipe(), patchResponse: {summary: 'ok', modelHash: 'h-next', invalidatedPaths: []}})
            const tool = updateRecipeValuesTool(aFakeGuiRequests(handler))

            read(tool.invoke$({
                recipeId: 'r1', baseModelHash: 'h-base',
                writableHandles: ['cloudMethods'],
                values: {cloudMethods: ['sepalCloudScore', 'landsatCFMask']}
            }, context))

            const patch = calls.find(request => request.action === 'recipe-patch')
            expect(patch.params.operations).toEqual([
                {op: 'replace', path: '/compositeOptions/includedCloudMasking', value: ['sepalCloudScore', 'landsatCFMask']}
            ])
            for (const op of patch.params.operations) {
                expect(op.path).not.toMatch(/\/\d+(\/|$)/)
                expect(op.op).not.toBe('remove')
            }
        })

        it('replaces the whole datasets object as one op', () => {
            const {handler, calls} = aGuiHandler({recipe: aMosaicRecipe(), patchResponse: {summary: 'ok', modelHash: 'h-next', invalidatedPaths: []}})
            const tool = updateRecipeValuesTool(aFakeGuiRequests(handler))

            read(tool.invoke$({
                recipeId: 'r1', baseModelHash: 'h-base',
                writableHandles: ['datasets'],
                values: {datasets: {LANDSAT: ['LANDSAT_9', 'LANDSAT_8']}}
            }, context))

            const patch = calls.find(request => request.action === 'recipe-patch')
            expect(patch.params.operations).toEqual([
                {op: 'replace', path: '/sources/dataSets', value: {LANDSAT: ['LANDSAT_9', 'LANDSAT_8']}}
            ])
        })

        it('replaces the whole filters array even when going from non-empty to empty', () => {
            const recipe = aMosaicRecipe()
            recipe.model.compositeOptions.filters = [{type: 'SHADOW', percentile: 20}]
            const {handler, calls} = aGuiHandler({recipe, patchResponse: {summary: 'ok', modelHash: 'h-next', invalidatedPaths: []}})
            const tool = updateRecipeValuesTool(aFakeGuiRequests(handler))

            read(tool.invoke$({
                recipeId: 'r1', baseModelHash: 'h-base',
                writableHandles: ['filters'],
                values: {filters: []}
            }, context))

            const patch = calls.find(request => request.action === 'recipe-patch')
            expect(patch.params.operations).toEqual([
                {op: 'replace', path: '/compositeOptions/filters', value: []}
            ])
        })
    })

    describe('success and failure envelopes (handle-keyed)', () => {

        it('returns ok with appliedHandles and summary on success', () => {
            const {handler} = aGuiHandler({recipe: aMosaicRecipe(), patchResponse: {summary: 'Updated cloud buffer.', modelHash: 'h-next', invalidatedPaths: ['/compositeOptions/cloudBuffer']}})
            const tool = updateRecipeValuesTool(aFakeGuiRequests(handler))

            const result = read(tool.invoke$({
                recipeId: 'r1', baseModelHash: 'h-base',
                writableHandles: ['cloudBuffer'],
                values: {cloudBuffer: 120}
            }, context))

            expect(result.ok).toBe(true)
            expect(result.data.summary).toBe('Updated cloud buffer.')
            expect(result.data.modelHash).toBe('h-next')
            expect(result.data.appliedHandles).toEqual(['cloudBuffer'])
        })

        it('returns an empty appliedHandles success when no value differed (no GUI call)', () => {
            const {handler, calls} = aGuiHandler({recipe: aMosaicRecipe()})
            const tool = updateRecipeValuesTool(aFakeGuiRequests(handler))

            const result = read(tool.invoke$({
                recipeId: 'r1', baseModelHash: 'h-base',
                writableHandles: ['cloudBuffer', 'snowMasking'],
                values: {cloudBuffer: 0, snowMasking: 'ON'}
            }, context))

            expect(result.ok).toBe(true)
            expect(result.data.appliedHandles).toEqual([])
            expect(calls.some(request => request.action === 'recipe-patch')).toBe(false)
        })

        it('maps GUI VALIDATION_FAILED error path errors back to handles, keyed by handle', () => {
            const validationError = Object.assign(new Error('validation failed'), {
                code: 'VALIDATION_FAILED',
                errors: [{path: '/compositeOptions/corrections', message: 'cross-sensor calibration requires both Landsat and Sentinel-2'}]
            })
            const {handler} = aGuiHandler({recipe: aMosaicRecipe(), patchResponse: () => throwError(() => validationError)})
            const tool = updateRecipeValuesTool(aFakeGuiRequests(handler))

            const result = read(tool.invoke$({
                recipeId: 'r1', baseModelHash: 'h-base',
                writableHandles: ['corrections'],
                values: {corrections: ['CALIBRATE']}
            }, context))

            expect(result.ok).toBe(false)
            expect(result.error.code).toBe('VALIDATION_FAILED')
            expect(result.error.handleErrors).toEqual([
                {handle: 'corrections', message: 'cross-sensor calibration requires both Landsat and Sentinel-2'}
            ])
        })

        it('passes a STALE_WRITE through with currentModelHash', () => {
            const staleError = Object.assign(new Error('stale write'), {code: 'STALE_WRITE', currentModelHash: 'h-other'})
            const {handler} = aGuiHandler({recipe: aMosaicRecipe(), patchResponse: () => throwError(() => staleError)})
            const tool = updateRecipeValuesTool(aFakeGuiRequests(handler))

            const result = read(tool.invoke$({
                recipeId: 'r1', baseModelHash: 'h-base',
                writableHandles: ['targetDate'],
                values: {targetDate: '2023-07-02'}
            }, context))

            expect(result.ok).toBe(false)
            expect(result.error.code).toBe('STALE_WRITE')
            expect(result.error.currentModelHash).toBe('h-other')
        })

        it('maps a pathless detail to a null-handle handleErrors entry without crashing', () => {
            const validationError = Object.assign(new Error('bad'), {
                code: 'VALIDATION_FAILED',
                errors: [{message: 'something is wrong, no path attached'}]
            })
            const {handler} = aGuiHandler({recipe: aMosaicRecipe(), patchResponse: () => throwError(() => validationError)})
            const tool = updateRecipeValuesTool(aFakeGuiRequests(handler))

            const result = read(tool.invoke$({
                recipeId: 'r1', baseModelHash: 'h-base',
                writableHandles: ['cloudBuffer'],
                values: {cloudBuffer: 120}
            }, context))

            expect(result.ok).toBe(false)
            expect(result.error.handleErrors).toEqual([
                {handle: null, message: 'something is wrong, no path attached'}
            ])
        })

        it('maps required-property messages back to the missing field handle when the bridge omitted missingProperty', () => {
            const validationError = Object.assign(new Error('bad'), {
                code: 'VALIDATION_FAILED',
                errors: [{path: '/compositeOptions', message: 'must have required property \'brdfMultiplier\''}]
            })
            const {handler} = aGuiHandler({recipe: aMosaicRecipe(), patchResponse: () => throwError(() => validationError)})
            const tool = updateRecipeValuesTool(aFakeGuiRequests(handler))

            const result = read(tool.invoke$({
                recipeId: 'r1', baseModelHash: 'h-base',
                writableHandles: ['cloudMethods'],
                values: {cloudMethods: ['sepalCloudScore']}
            }, context))

            expect(result.ok).toBe(false)
            expect(result.error.handleErrors).toEqual([
                {handle: 'brdfMultiplier', message: 'must have required property \'brdfMultiplier\''}
            ])
        })

        it('does not leak JSON Pointer paths in the failure envelope; handleErrors is the model-facing surface', () => {
            const validationError = Object.assign(new Error('validation failed'), {
                code: 'VALIDATION_FAILED',
                errors: [{path: '/compositeOptions/corrections', rule: 'someRule', message: 'cross-sensor calibration requires both Landsat and Sentinel-2'}],
                details: [{path: '/sources/dataSets', rule: 'multipleSources', message: 'detail message'}]
            })
            const {handler} = aGuiHandler({recipe: aMosaicRecipe(), patchResponse: () => throwError(() => validationError)})
            const tool = updateRecipeValuesTool(aFakeGuiRequests(handler))

            const result = read(tool.invoke$({
                recipeId: 'r1', baseModelHash: 'h-base',
                writableHandles: ['corrections'],
                values: {corrections: ['CALIBRATE']}
            }, context))

            expect(result.ok).toBe(false)
            expect(result.error.handleErrors.length).toBeGreaterThan(0)
            // Raw errors/details (path-bearing) must not be re-emitted to the updater.
            expect(result.error).not.toHaveProperty('errors')
            expect(result.error).not.toHaveProperty('details')
            expect(JSON.stringify(result.error)).not.toMatch(/\/compositeOptions\//)
            expect(JSON.stringify(result.error)).not.toMatch(/\/sources\//)
        })
    })

    describe('diff against the effective model, not the stored model', () => {

        it('generates add (not replace) when the stored model has a dormant field that toEffectiveModel strips — same call re-enables the activating condition', () => {
            // Stored has corrections=['SR'] so brdfMultiplier is dormant (stripped by
            // projection). The same atomic call re-enables BRDF and sets brdfMultiplier:
            // brdfMultiplier survives projection now, and because the EFFECTIVE model
            // (pre-call) lacked it, the patch must `add` not `replace`.
            const recipe = aMosaicRecipe()
            recipe.model.sources.dataSets = {LANDSAT: ['LANDSAT_9']}
            recipe.model.compositeOptions.corrections = ['SR']
            recipe.model.compositeOptions.brdfMultiplier = 4
            const {handler, calls} = aGuiHandler({recipe, patchResponse: {summary: 'ok', modelHash: 'h-next', invalidatedPaths: []}})
            const tool = updateRecipeValuesTool(aFakeGuiRequests(handler))

            read(tool.invoke$({
                recipeId: 'r1', baseModelHash: 'h-base',
                writableHandles: ['corrections', 'brdfMultiplier'],
                values: {corrections: ['BRDF'], brdfMultiplier: 5}
            }, context))

            const patch = calls.find(request => request.action === 'recipe-patch')
            expect(patch.params.operations).toEqual(expect.arrayContaining([
                {op: 'add', path: '/compositeOptions/brdfMultiplier', value: 5}
            ]))
        })

        it('generates add when toEffectiveModel strips method-tuning for an unused cloud method — same call activates the method', () => {
            // Stored has landsatCFMaskCloudMasking even though includedCloudMasking omits landsatCFMask;
            // toEffectiveModel strips that field. Updater activates landsatCFMask in the
            // same call (with all required companions per schema) so projection survives;
            // the EFFECTIVE model lacked landsatCloudMask so the patch must be `add`.
            const recipe = aMosaicRecipe()
            recipe.model.compositeOptions.includedCloudMasking = ['sepalCloudScore']
            recipe.model.compositeOptions.landsatCFMaskCloudMasking = 'MODERATE'
            const {handler, calls} = aGuiHandler({recipe, patchResponse: {summary: 'ok', modelHash: 'h-next', invalidatedPaths: []}})
            const tool = updateRecipeValuesTool(aFakeGuiRequests(handler))

            read(tool.invoke$({
                recipeId: 'r1', baseModelHash: 'h-base',
                writableHandles: ['cloudMethods', 'landsatCloudMask', 'landsatShadowMask', 'landsatCirrusMask', 'landsatDilatedCloud'],
                values: {
                    cloudMethods: ['sepalCloudScore', 'landsatCFMask'],
                    landsatCloudMask: 'AGGRESSIVE',
                    landsatShadowMask: 'AGGRESSIVE',
                    landsatCirrusMask: 'AGGRESSIVE',
                    landsatDilatedCloud: 'REMOVE'
                }
            }, context))

            const patch = calls.find(request => request.action === 'recipe-patch')
            expect(patch.params.operations).toEqual(expect.arrayContaining([
                {op: 'add', path: '/compositeOptions/landsatCFMaskCloudMasking', value: 'AGGRESSIVE'}
            ]))
        })
    })

    describe('invalidatedHandles instead of invalidatedPaths on success', () => {

        it('returns invalidatedHandles mapped from GUI invalidatedPaths; raw paths do not reach the updater', () => {
            const {handler} = aGuiHandler({
                recipe: aMosaicRecipe(),
                patchResponse: {summary: 'ok', modelHash: 'h-next', invalidatedPaths: ['/sources/dataSets', '/compositeOptions/includedCloudMasking']}
            })
            const tool = updateRecipeValuesTool(aFakeGuiRequests(handler))

            const result = read(tool.invoke$({
                recipeId: 'r1', baseModelHash: 'h-base',
                writableHandles: ['datasets'],
                values: {datasets: {LANDSAT: ['LANDSAT_9']}}
            }, context))

            expect(result.ok).toBe(true)
            expect(result.data).not.toHaveProperty('invalidatedPaths')
            expect(result.data.invalidatedHandles.sort()).toEqual(['cloudMethods', 'datasets'])
        })

        it('walks a sub-path invalidation up to the nearest ancestor handle', () => {
            const {handler} = aGuiHandler({
                recipe: aMosaicRecipe(),
                patchResponse: {summary: 'ok', modelHash: 'h-next', invalidatedPaths: ['/sources/dataSets/SENTINEL_2']}
            })
            const tool = updateRecipeValuesTool(aFakeGuiRequests(handler))

            const result = read(tool.invoke$({
                recipeId: 'r1', baseModelHash: 'h-base',
                writableHandles: ['datasets'],
                values: {datasets: {LANDSAT: ['LANDSAT_9']}}
            }, context))

            expect(result.data.invalidatedHandles).toEqual(['datasets'])
        })

        it('drops invalidated paths that do not map to any handle rather than leaking the raw pointer', () => {
            const {handler} = aGuiHandler({
                recipe: aMosaicRecipe(),
                patchResponse: {summary: 'ok', modelHash: 'h-next', invalidatedPaths: ['/scenes', '/sources/dataSets']}
            })
            const tool = updateRecipeValuesTool(aFakeGuiRequests(handler))

            const result = read(tool.invoke$({
                recipeId: 'r1', baseModelHash: 'h-base',
                writableHandles: ['datasets'],
                values: {datasets: {LANDSAT: ['LANDSAT_9']}}
            }, context))

            expect(result.data.invalidatedHandles).toEqual(['datasets'])
            expect(JSON.stringify(result.data)).not.toMatch(/\/scenes/)
        })

        it('returns invalidatedHandles=[] when GUI omits or returns empty invalidatedPaths', () => {
            const {handler} = aGuiHandler({
                recipe: aMosaicRecipe(),
                patchResponse: {summary: 'ok', modelHash: 'h-next'}
            })
            const tool = updateRecipeValuesTool(aFakeGuiRequests(handler))

            const result = read(tool.invoke$({
                recipeId: 'r1', baseModelHash: 'h-base',
                writableHandles: ['cloudBuffer'],
                values: {cloudBuffer: 120}
            }, context))

            expect(result.data.invalidatedHandles).toEqual([])
        })
    })
})
