const {of} = require('rxjs')
const {aToolFactoryHarness, innerToolsImpl} = require('../../harness')
const {SPECIALIST_CAP_ANSWER} = require('#mcp/chat/specialists/runSpecialist')

describe('update_recipe outer envelope reflects whether the patch applied', () => {

    const patchOp = {op: 'replace', path: '/dates/seasonEnd', value: '2026-06-01'}
    const prepareResult = {ok: true, data: {baseModelHash: 'h1', focusPaths: ['/dates/seasonEnd'], dependentPaths: ['/dates/targetDate'], writablePaths: ['/dates/seasonEnd', '/dates/targetDate'], currentValues: {}, dependencyFacts: [], validationRules: []}}
    const prepareCall = {id: 'tu1', name: 'prepare_update', input: {recipeId: 'r1', focusPaths: ['/dates/seasonEnd']}}

    function aSpecialist({patchCalls, finalText, patchResults}) {
        const replies = [{toolCalls: [prepareCall]}]
        patchCalls.forEach((op, i) => replies.push({toolCalls: [{id: `tp${i}`, name: 'recipe_patch', input: {
            recipeId: 'r1', baseModelHash: 'h1', operations: [op]
        }}]}))
        replies.push({text: finalText})
        let patchIndex = 0
        const innerTools = innerToolsImpl({
            prepare_update: () => of(prepareResult),
            recipe_patch: () => of(patchResults[patchIndex++])
        }, [
            {name: 'prepare_update', description: 'Prepare.', parameters: {type: 'object', properties: {recipeId: {type: 'string'}, focusPaths: {type: 'array', items: {type: 'string'}}}}},
            {name: 'recipe_patch', description: 'Patch.', parameters: {type: 'object', properties: {recipeId: {type: 'string'}, baseModelHash: {type: 'string'}, operations: {type: 'array'}}}}
        ])
        return aToolFactoryHarness({specialist: 'update_recipe', replies, innerTools})
    }

    it('returns {ok:true, data:{answer}} when recipe_patch succeeded', () => {
        const harness = aSpecialist({
            patchCalls: [patchOp],
            finalText: 'Season end set to 2026-06-01.',
            patchResults: [{ok: true, data: {summary: 'patched', modelHash: 'h2', invalidatedPaths: ['/dates/seasonEnd']}}]
        })

        const result = harness.invoke({recipeId: 'r1', instruction: 'edit'})

        expect(result).toEqual({ok: true, data: {answer: 'Season end set to 2026-06-01.'}})
    })

    it('returns {ok:false, UPDATE_FAILED} carrying the patch error and specialist answer when recipe_patch returned ok:false', () => {
        const patchError = {code: 'PATCH_APPLY_FAILED', message: 'path not found: /dates/seasonEnd'}
        const harness = aSpecialist({
            patchCalls: [patchOp],
            finalText: 'I tried but the patch failed.',
            patchResults: [{ok: false, error: patchError}]
        })

        const result = harness.invoke({recipeId: 'r1', instruction: 'edit'})

        expect(result).toMatchObject({
            ok: false,
            error: {
                code: 'UPDATE_FAILED',
                message: 'path not found: /dates/seasonEnd',
                patchError,
                specialistAnswer: 'I tried but the patch failed.'
            }
        })
    })

    it('returns {ok:false, UPDATE_NOT_ATTEMPTED} when the specialist never called recipe_patch', () => {
        const innerTools = innerToolsImpl(
            {prepare_update: () => of(prepareResult)},
            [
                {name: 'prepare_update', description: 'Prepare.', parameters: {type: 'object', properties: {recipeId: {type: 'string'}, focusPaths: {type: 'array', items: {type: 'string'}}}}},
                {name: 'recipe_patch', description: 'Patch.', parameters: {type: 'object', properties: {recipeId: {type: 'string'}, baseModelHash: {type: 'string'}, operations: {type: 'array'}}}}
            ]
        )
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            innerTools,
            replies: [
                {toolCalls: [prepareCall]},
                {text: 'I looked at the recipe but did not patch anything.'}
            ]
        })

        const result = harness.invoke({recipeId: 'r1', instruction: 'edit'})

        expect(result).toMatchObject({
            ok: false,
            error: {
                code: 'UPDATE_NOT_ATTEMPTED',
                specialistAnswer: 'I looked at the recipe but did not patch anything.'
            }
        })
    })

    it('builds a user-facing failure answer from the last patch validation details (rule, message, path)', () => {
        const patchError = {
            code: 'VALIDATION_FAILED',
            message: 'recipe model failed validation',
            details: [{
                path: '/compositeOptions/corrections',
                rule: 'calibrateRequiresMultipleSources',
                message: 'cross-sensor calibration requires both Landsat and Sentinel-2 source groups'
            }]
        }
        const harness = aSpecialist({
            patchCalls: [patchOp],
            finalText: SPECIALIST_CAP_ANSWER,
            patchResults: [{ok: false, error: patchError}]
        })

        const result = harness.invoke({recipeId: 'r1', instruction: 'use only Landsat'})

        expect(result.ok).toBe(false)
        expect(result.error.code).toBe('UPDATE_FAILED')
        expect(result.error.answer).toMatch(/cross-sensor calibration requires both Landsat and Sentinel-2/)
        // Rule name + pointer are internal identifiers — kept in the structured
        // envelope for diagnostics, kept out of the user-facing prose.
        expect(result.error.answer).not.toMatch(/calibrateRequiresMultipleSources/)
        expect(result.error.answer).not.toMatch(/\/compositeOptions\/corrections/)
        expect(result.error.patchError.details).toEqual(patchError.details)
    })

    it('returns success when a later patch succeeds even if an earlier one failed', () => {
        const badPatch = {op: 'replace', path: '/dates/seasonEnd', value: 'not-a-date'}
        const goodPatch = {op: 'replace', path: '/dates/seasonEnd', value: '2026-06-01'}
        const patchError = {code: 'VALIDATION_FAILED', message: 'bad', errors: []}
        const harness = aSpecialist({
            patchCalls: [badPatch, goodPatch],
            finalText: 'Got it on the second try.',
            patchResults: [
                {ok: false, error: patchError},
                {ok: true, data: {summary: 'patched', modelHash: 'h3', invalidatedPaths: ['/dates/seasonEnd']}}
            ]
        })

        const result = harness.invoke({recipeId: 'r1', instruction: 'edit'})

        expect(result).toEqual({ok: true, data: {answer: 'Got it on the second try.'}})
    })
})
