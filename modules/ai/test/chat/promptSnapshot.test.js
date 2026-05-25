const {renderPromptSnapshot} = require('#mcp/chat/promptSnapshot')

describe('renderPromptSnapshot', () => {

    describe('messages section', () => {

        it('emits a messages header and one block per message in order', () => {
            const out = renderPromptSnapshot({
                messages: [
                    {role: 'system', content: 'You are SEPAL.'},
                    {role: 'user', content: 'change the target date'}
                ],
                tools: []
            })

            expect(out).toMatch(/^=== messages ===/m)
            expect(out.indexOf('[0] role=system')).toBeLessThan(out.indexOf('[1] role=user'))
        })

        it('renders full text content for system and user messages (not just char counts)', () => {
            const out = renderPromptSnapshot({
                messages: [
                    {role: 'system', content: 'You are SEPAL specialist.'},
                    {role: 'user', content: 'instruction: change target date to 2026-06-01'}
                ],
                tools: []
            })

            expect(out).toContain('You are SEPAL specialist.')
            expect(out).toContain('instruction: change target date to 2026-06-01')
        })

        it('renders assistant tool calls with id, name, and input JSON', () => {
            const out = renderPromptSnapshot({
                messages: [
                    {role: 'assistant', content: '', toolCalls: [
                        {id: 'tu1', name: 'update_recipe_values', input: {recipeId: 'r1', values: {targetDate: '2026-06-01'}}}
                    ]}
                ],
                tools: []
            })

            expect(out).toMatch(/role=assistant/)
            expect(out).toContain('tu1')
            expect(out).toContain('update_recipe_values')
            expect(out).toContain('"recipeId":"r1"')
            expect(out).toContain('"targetDate":"2026-06-01"')
        })

        it('renders tool-result messages with toolCallId, toolName, ok, and a bounded shape', () => {
            const out = renderPromptSnapshot({
                messages: [
                    {role: 'tool', toolResults: [
                        {toolCallId: 'tu1', toolName: 'update_recipe_values', result: {ok: true, data: {appliedHandles: ['targetDate']}}}
                    ]}
                ],
                tools: []
            })

            expect(out).toMatch(/role=tool/)
            expect(out).toContain('toolCallId=tu1')
            expect(out).toContain('toolName=update_recipe_values')
            expect(out).toContain('ok=true')
        })

        it('renders a failed tool result with the error code in the shape', () => {
            const out = renderPromptSnapshot({
                messages: [
                    {role: 'tool', toolResults: [
                        {toolCallId: 'tu1', toolName: 'update_recipe_values', result: {ok: false, error: {code: 'VALIDATION_FAILED', message: 'bad'}}}
                    ]}
                ],
                tools: []
            })

            expect(out).toContain('ok=false')
            expect(out).toContain('VALIDATION_FAILED')
        })

        it('preserves real prompt content up to the snapshot cap (the picker prompt + full MOSAIC handle catalog survives intact)', () => {
            const {pickerSystemPrompt} = require('#mcp/chat/specialists/updateRecipe/pickHandles')
            const realSystemPrompt = pickerSystemPrompt('MOSAIC')

            const out = renderPromptSnapshot({
                messages: [{role: 'system', content: realSystemPrompt}],
                tools: []
            })

            // Late handle-catalog content must survive: the BRDF / date handles
            // land near the end of the assembled picker prompt.
            expect(out).toContain('brdfMultiplier')
            expect(out).toContain('yearsAfter')
        })

        it('still bounds genuinely huge content with a cap so a runaway can never dump megabytes', () => {
            const huge = 'x'.repeat(500_000)
            const out = renderPromptSnapshot({
                messages: [{role: 'user', content: huge}],
                tools: []
            })

            expect(out.length).toBeLessThan(huge.length)
            expect(out).toContain('...')
        })
    })

    describe('tools section', () => {

        it('emits a tools header followed by one block per tool', () => {
            const out = renderPromptSnapshot({
                messages: [],
                tools: [
                    {name: 'recipe_load', description: 'Load one recipe.', parameters: {type: 'object'}},
                    {name: 'update_recipe_values', description: 'Apply handle-keyed update.', parameters: {type: 'object'}}
                ]
            })

            expect(out).toMatch(/^=== tools ===/m)
            expect(out.indexOf('name=recipe_load')).toBeLessThan(out.indexOf('name=update_recipe_values'))
        })

        it('renders each tool with name, description, and parameter JSON', () => {
            const out = renderPromptSnapshot({
                messages: [],
                tools: [{
                    name: 'update_recipe_values',
                    description: 'Apply a handle-keyed update to ONE recipe.',
                    parameters: {type: 'object', properties: {recipeId: {type: 'string'}}}
                }]
            })

            expect(out).toContain('Apply a handle-keyed update to ONE recipe.')
            expect(out).toContain('"properties":{"recipeId":{"type":"string"}}')
        })

        it("renders 'tools: (none)' when the tool list is empty", () => {
            const out = renderPromptSnapshot({messages: [], tools: []})

            expect(out).toContain('tools: (none)')
        })

        it('truncates a parameter schema that exceeds the snapshot cap rather than dumping unbounded JSON', () => {
            // Build a schema whose JSON-serialised length comfortably exceeds the
            // 100KB snapshot cap so the truncation marker has to land.
            const wide = {}
            for (let i = 0; i < 5000; i++) wide[`field_${i}`] = {type: 'string', description: 'x'.repeat(50)}
            const out = renderPromptSnapshot({
                messages: [],
                tools: [{name: 't', description: 'd', parameters: {type: 'object', properties: wide}}]
            })

            const parametersBlock = out.split('parameters=')[1]
            expect(parametersBlock.length).toBeLessThan(JSON.stringify({type: 'object', properties: wide}).length)
            expect(parametersBlock).toContain('...')
        })
    })
})
