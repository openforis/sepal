const {of} = require('rxjs')
const {aToolFactoryHarness, innerToolsImpl} = require('../../harness')

describe('update_recipe outer envelope reflects whether the patch applied', () => {

    const patchOp = {op: 'replace', path: '/dates/seasonEnd', value: '2026-06-01'}
    const closureResult = {baseModelHash: 'h1', intent: 'dateWindow', currentValues: {}, dependentPaths: ['/dates/seasonEnd'], guidance: []}
    const loadCall = {id: 'tl1', name: 'load_for_update', input: {recipeId: 'r1', instruction: 'edit'}}

    function aSpecialist({patchCalls, finalText, patchResults}) {
        const replies = [{toolCalls: [loadCall]}]
        patchCalls.forEach((op, i) => replies.push({toolCalls: [{id: `tp${i}`, name: 'recipe_patch', input: {
            recipeId: 'r1', baseModelHash: 'h1', operations: [op]
        }}]}))
        replies.push({text: finalText})
        let patchIndex = 0
        const innerTools = innerToolsImpl({
            load_for_update: () => of(closureResult),
            recipe_patch: () => of(patchResults[patchIndex++])
        }, [
            {name: 'load_for_update', description: 'Closure.', parameters: {type: 'object', properties: {recipeId: {type: 'string'}, instruction: {type: 'string'}}}},
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

        expect(result).toEqual({
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
            {load_for_update: () => of(closureResult)},
            [
                {name: 'load_for_update', description: 'Closure.', parameters: {type: 'object', properties: {recipeId: {type: 'string'}, instruction: {type: 'string'}}}},
                {name: 'recipe_patch', description: 'Patch.', parameters: {type: 'object', properties: {recipeId: {type: 'string'}, baseModelHash: {type: 'string'}, operations: {type: 'array'}}}}
            ]
        )
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            innerTools,
            replies: [
                {toolCalls: [loadCall]},
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
