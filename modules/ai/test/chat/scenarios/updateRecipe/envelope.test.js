const {of} = require('rxjs')
const {aToolFactoryHarness, innerToolsImpl} = require('../../harness')

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
            {update_recipe_values: () => of(updateResults[i++])},
            [{
                name: 'update_recipe_values',
                description: 'Update.',
                parameters: {type: 'object', properties: {recipeId: {type: 'string'}, baseModelHash: {type: 'string'}, writableHandles: {type: 'array'}, values: {type: 'object'}}}
            }]
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
        const updateError = {code: 'VALIDATION_FAILED', message: 'cross-sensor calibration required', handleErrors: [{handle: 'corrections', message: 'cross-sensor calibration required'}]}
        const harness = aSpecialist({
            updateResults: [{ok: false, error: updateError}],
            finalText: 'I tried but the update failed.'
        })

        const result = harness.invoke({recipeId: 'r1', instruction: 'edit'})

        expect(result).toMatchObject({
            ok: false,
            error: {
                code: 'UPDATE_FAILED',
                message: 'cross-sensor calibration required',
                patchError: updateError,
                specialistAnswer: 'I tried but the update failed.'
            }
        })
    })

    it('returns {ok:false, UPDATE_NOT_ATTEMPTED} when the updater never called update_recipe_values', () => {
        const innerTools = innerToolsImpl({update_recipe_values: () => of({ok: true, data: {summary: '', modelHash: 'h2', appliedHandles: [], invalidatedPaths: []}})}, [{
            name: 'update_recipe_values',
            description: 'Update.',
            parameters: {type: 'object', properties: {recipeId: {type: 'string'}, baseModelHash: {type: 'string'}, writableHandles: {type: 'array'}, values: {type: 'object'}}}
        }])
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            innerTools,
            replies: [
                {text: '{"handles":["targetDate"]}'},
                {text: 'I looked but did not change anything.'}
            ]
        })

        const result = harness.invoke({recipeId: 'r1', instruction: 'edit'})

        expect(result).toMatchObject({
            ok: false,
            error: {
                code: 'UPDATE_NOT_ATTEMPTED',
                specialistAnswer: 'I looked but did not change anything.'
            }
        })
    })

    it('builds a user-facing failure answer from handle-keyed errors', () => {
        const updateError = {
            code: 'VALIDATION_FAILED',
            message: 'recipe model failed validation',
            handleErrors: [{handle: 'corrections', message: 'cross-sensor calibration requires both Landsat and Sentinel-2 source groups'}]
        }
        const harness = aSpecialist({
            updateResults: [{ok: false, error: updateError}],
            finalText: 'Specialist step cap exceeded; partial information only.'
        })

        const result = harness.invoke({recipeId: 'r1', instruction: 'use only Landsat'})

        expect(result.ok).toBe(false)
        expect(result.error.code).toBe('UPDATE_FAILED')
        expect(result.error.answer).toMatch(/corrections: cross-sensor calibration requires both Landsat and Sentinel-2/)
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
            {update_recipe_values: () => of(results[i++])},
            [{
                name: 'update_recipe_values',
                description: 'Update.',
                parameters: {type: 'object', properties: {recipeId: {type: 'string'}, baseModelHash: {type: 'string'}, writableHandles: {type: 'array'}, values: {type: 'object'}}}
            }]
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
