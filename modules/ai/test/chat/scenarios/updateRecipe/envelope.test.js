const {of} = require('rxjs')
const {aToolFactoryHarness, innerToolsImpl, AOI_INNER_TOOL_SCHEMAS, AOI_INNER_TOOL_IMPLS} = require('../../harness')

describe('update_recipe outer envelope reflects whether the update applied', () => {

    const updateCall = {id: 'tu1', name: 'update_recipe_values', input: {
        recipeId: 'r1', baseModelHash: 'h-base',
        writableHandles: ['targetDate', 'seasonStart', 'seasonEnd'],
        values: {targetDate: '2023-07-02', seasonStart: '2023-01-01', seasonEnd: '2024-01-01'}
    }}

    function aSpecialist({updateResults, finalText}) {
        const replies = [{text: '{"handles":["targetDate"]}'}]
        updateResults.forEach((_, i) => replies.push({toolCalls: [{...updateCall, id: `tu${i}`}]}))
        replies.push({text: finalText})
        let i = 0
        const innerTools = innerToolsImpl(
            {
                update_recipe_values: () => of(updateResults[i++]),
                ...AOI_INNER_TOOL_IMPLS
            },
            [
                {
                    name: 'update_recipe_values',
                    description: 'Update.',
                    parameters: {type: 'object', properties: {recipeId: {type: 'string'}, baseModelHash: {type: 'string'}, writableHandles: {type: 'array'}, values: {type: 'object'}}}
                },
                ...AOI_INNER_TOOL_SCHEMAS
            ]
        )
        return aToolFactoryHarness({specialist: 'update_recipe', innerTools, replies})
    }

    it('returns {ok:true, data:{answer}} when update_recipe_values succeeded', () => {
        const harness = aSpecialist({
            updateResults: [{ok: true, data: {summary: 'updated', modelHash: 'h-next', appliedHandles: ['targetDate'], invalidatedPaths: []}}],
            finalText: 'Target date set to 2023-07-02.'
        })

        const result = harness.invoke({recipeId: 'r1', instruction: 'shift target date'})

        expect(result).toEqual({ok: true, data: {answer: 'Target date set to 2023-07-02.'}})
    })

    it('returns {ok:false, UPDATE_FAILED} carrying the tool error and specialist answer on a single failed call', () => {
        // handleErrors targets a handle already in writableHandles so the workflow's validation-rescope retry
        // doesn't fire — this test pins the failure envelope shape, not the rescope path.
        const updateError = {code: 'VALIDATION_FAILED', message: 'targetDate out of range', handleErrors: [{handle: 'targetDate', message: 'targetDate out of range'}]}
        const harness = aSpecialist({
            updateResults: [{ok: false, error: updateError}],
            finalText: 'I tried but the update failed.'
        })

        const result = harness.invoke({recipeId: 'r1', instruction: 'edit'})

        expect(result).toMatchObject({
            ok: false,
            error: {
                code: 'UPDATE_FAILED',
                message: 'targetDate out of range',
                patchError: updateError,
                specialistAnswer: 'I tried but the update failed.'
            }
        })
    })

    it('classifies a not-attempted updater with non-empty text as CLARIFICATION_NEEDED, carrying the updater text as error.answer for direct surface to the user', () => {
        const harness = aNeverCallsUpdate({text: 'Cloud Score+ requires Sentinel-2. Do you want to add Sentinel-2 to this recipe?'})

        const result = harness.invoke({recipeId: 'r1', instruction: 'Use Cloud Score+ instead'})

        expect(result).toMatchObject({
            ok: false,
            error: {
                code: 'CLARIFICATION_NEEDED',
                answer: 'Cloud Score+ requires Sentinel-2. Do you want to add Sentinel-2 to this recipe?'
            }
        })
    })

    it('reserves UPDATE_NOT_ATTEMPTED for the not-attempted + empty-text case (nothing to surface to the user)', () => {
        const harness = aNeverCallsUpdate({text: ''})

        const result = harness.invoke({recipeId: 'r1', instruction: 'edit'})

        expect(result).toMatchObject({ok: false, error: {code: 'UPDATE_NOT_ATTEMPTED'}})
    })

    it('does not promote a capped run with no successful update to CLARIFICATION_NEEDED (cap text is a runtime sentinel, not a user-intended clarification)', () => {
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            replies: [
                {text: '{"handles":["targetDate"]}'},
                {text: ''}, {text: ''}, {text: ''}
            ]
        })

        const result = harness.invoke({recipeId: 'r1', instruction: 'edit'})

        expect(result.ok).toBe(false)
        expect(result.error.code).not.toBe('CLARIFICATION_NEEDED')
    })

    it('builds a user-facing failure answer from handle-keyed errors', () => {
        // handleErrors targets a writable handle so the validation-rescope retry
        // doesn't fire — this test pins the user-facing answer assembly, not rescope.
        const updateError = {
            code: 'VALIDATION_FAILED',
            message: 'recipe model failed validation',
            handleErrors: [{handle: 'targetDate', message: 'must be on or after 1982-08-22'}]
        }
        const harness = aSpecialist({
            updateResults: [{ok: false, error: updateError}],
            finalText: 'Specialist step cap exceeded; partial information only.'
        })

        const result = harness.invoke({recipeId: 'r1', instruction: 'set target date'})

        expect(result.ok).toBe(false)
        expect(result.error.code).toBe('UPDATE_FAILED')
        expect(result.error.answer).toMatch(/targetDate: must be on or after 1982-08-22/)
    })

    it('returns success when a later update_recipe_values succeeds even after an earlier failure', () => {
        const firstUpdate = {id: 'tu-1', name: 'update_recipe_values', input: {
            recipeId: 'r1', baseModelHash: 'h-base',
            writableHandles: ['targetDate', 'seasonStart', 'seasonEnd'],
            values: {targetDate: 'not-a-date'}
        }}
        const secondUpdate = {id: 'tu-2', name: 'update_recipe_values', input: {
            recipeId: 'r1', baseModelHash: 'h-base',
            writableHandles: ['targetDate', 'seasonStart', 'seasonEnd'],
            values: {targetDate: '2023-07-02'}
        }}
        const results = [
            {ok: false, error: {code: 'VALIDATION_FAILED', message: 'bad', handleErrors: []}},
            {ok: true, data: {summary: 'updated', modelHash: 'h-next', appliedHandles: ['targetDate'], invalidatedPaths: []}}
        ]
        let i = 0
        const innerTools = innerToolsImpl(
            {
                update_recipe_values: () => of(results[i++]),
                ...AOI_INNER_TOOL_IMPLS
            },
            [
                {
                    name: 'update_recipe_values',
                    description: 'Update.',
                    parameters: {type: 'object', properties: {recipeId: {type: 'string'}, baseModelHash: {type: 'string'}, writableHandles: {type: 'array'}, values: {type: 'object'}}}
                },
                ...AOI_INNER_TOOL_SCHEMAS
            ]
        )
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            innerTools,
            replies: [
                {text: '{"handles":["targetDate"]}'},
                {toolCalls: [firstUpdate]},
                {toolCalls: [secondUpdate]},
                {text: 'Got it on the second try.'}
            ]
        })

        const result = harness.invoke({recipeId: 'r1', instruction: 'edit'})

        expect(result).toEqual({ok: true, data: {answer: 'Got it on the second try.'}})
    })
})

function aNeverCallsUpdate({text}) {
    return aToolFactoryHarness({
        specialist: 'update_recipe',
        replies: [
            {text: '{"handles":["targetDate"]}'},
            {text}
        ]
    })
}
