const {aToolFactoryHarness} = require('../../harness')

// Empty picker means the request didn't map to any handle in the catalog.
// That's a clarification opportunity, not an update failure: pendingActions
// lifts CLARIFICATION_NEEDED into a resumable pending action, so we surface
// a targeted question instead of the old "please try rephrasing" error.
describe('update_recipe — empty picker turns into a clarification', () => {

    it('returns a CLARIFICATION_NEEDED envelope carrying a non-empty answer when the picker chose no handles', () => {
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            replies: [{text: '{"handles":[]}'}]
        })

        const result = harness.invoke({recipeId: 'r1', request: "fix it"})

        expect(result.ok).toBe(false)
        expect(result.error.code).toBe('CLARIFICATION_NEEDED')
        expect(typeof result.error.answer).toBe('string')
        expect(result.error.answer.trim().length).toBeGreaterThan(0)
    })

    it('preserves PICKER_EMPTY as an internal diagnostic on the envelope so the cause stays visible', () => {
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            replies: [{text: '{"handles":[]}'}]
        })

        const result = harness.invoke({recipeId: 'r1', request: "make it nicer"})

        expect(result.error.reason).toBe('PICKER_EMPTY')
    })

    it('publishes an update_recipe.outcome event with code=CLARIFICATION_NEEDED, not PICKER_EMPTY/UPDATE_FAILED', () => {
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            replies: [{text: '{"handles":[]}'}]
        })

        harness.invoke({recipeId: 'r1', request: "do something"})

        const outcomes = harness.bus.events.filter(event => event.type === 'update_recipe.outcome')
        expect(outcomes).toHaveLength(1)
        expect(outcomes[0]).toMatchObject({
            code: 'CLARIFICATION_NEEDED',
            patchAttempted: false,
            patchSucceeded: false
        })
    })

    it('asks a performance-flavored question when the request mentions speed/performance', () => {
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            replies: [{text: '{"handles":[]}'}]
        })

        const result = harness.invoke({recipeId: 'r1', request: "it's too slow, fix it"})

        expect(result.error.code).toBe('CLARIFICATION_NEEDED')
        expect(result.error.answer).toMatch(/fast|simplif|reduc|preserve quality/i)
    })

    it('asks to redirect to recipe settings when the request names something outside recipe scope', () => {
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            replies: [{text: '{"handles":[]}'}]
        })

        const result = harness.invoke({recipeId: 'r1', request: 'increase tile size and disable per-pixel processing'})

        expect(result.error.code).toBe('CLARIFICATION_NEEDED')
        expect(result.error.answer).toMatch(/recipe setting/i)
    })

    it('still surfaces a CLARIFICATION_NEEDED when only the legacy instruction field is passed', () => {
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            replies: [{text: '{"handles":[]}'}]
        })

        const result = harness.invoke({recipeId: 'r1', instruction: 'something'})

        expect(result.error.code).toBe('CLARIFICATION_NEEDED')
        expect(result.error.answer.trim().length).toBeGreaterThan(0)
    })
})
