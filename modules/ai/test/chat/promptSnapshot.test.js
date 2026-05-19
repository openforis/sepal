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
                        {id: 'tl1', name: 'load_for_update', input: {recipeId: 'r1', instruction: 'edit'}}
                    ]}
                ],
                tools: []
            })

            expect(out).toMatch(/role=assistant/)
            expect(out).toContain('tl1')
            expect(out).toContain('load_for_update')
            expect(out).toContain('"recipeId":"r1"')
            expect(out).toContain('"instruction":"edit"')
        })

        it('renders tool-result messages with toolCallId, toolName, ok, and a bounded shape', () => {
            const out = renderPromptSnapshot({
                messages: [
                    {role: 'tool', toolResults: [
                        {toolCallId: 'tl1', toolName: 'load_for_update', result: {ok: true, data: {intent: 'dateWindow'}}}
                    ]}
                ],
                tools: []
            })

            expect(out).toMatch(/role=tool/)
            expect(out).toContain('toolCallId=tl1')
            expect(out).toContain('toolName=load_for_update')
            expect(out).toContain('ok=true')
        })

        it('renders a failed tool result with the error code in the shape', () => {
            const out = renderPromptSnapshot({
                messages: [
                    {role: 'tool', toolResults: [
                        {toolCallId: 'tp1', toolName: 'recipe_patch', result: {ok: false, error: {code: 'VALIDATION_FAILED', message: 'bad'}}}
                    ]}
                ],
                tools: []
            })

            expect(out).toContain('ok=false')
            expect(out).toContain('VALIDATION_FAILED')
        })

        it('preserves real prompt content up to the snapshot cap (system prompts in the ~10KB range survive intact)', () => {
            const {assembleSpecialistPrompt} = require('#mcp/chat/specialists/assembleSpecialistPrompt')
            const {specialistPrompt} = require('#mcp/chat/llmText/prompts')
            const {getRecipeSpec} = require('#recipes')
            const realSystemPrompt = assembleSpecialistPrompt(
                specialistPrompt('update'), getRecipeSpec('MOSAIC'),
                {purpose: 'update', includeSchema: true}
            )

            const out = renderPromptSnapshot({
                messages: [{role: 'system', content: realSystemPrompt}],
                tools: []
            })

            // Late schema-rule content must survive: a MOSAIC schema rule referencing
            // `sepalCloudScore` lands near the trailing bytes of the assembled prompt.
            expect(out).toContain('sepalCloudScore')
            // And the closing schema-block fence has to land too — otherwise the LLM's
            // most-likely-attended part of the prompt is invisible to the trace.
            expect(out).toMatch(/```\s*$/m)
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
                    {name: 'load_for_update', description: 'Load + closure.', parameters: {type: 'object'}},
                    {name: 'recipe_patch', description: 'Apply patch.', parameters: {type: 'object'}}
                ]
            })

            expect(out).toMatch(/^=== tools ===/m)
            expect(out.indexOf('name=load_for_update')).toBeLessThan(out.indexOf('name=recipe_patch'))
        })

        it('renders each tool with name, description, and parameter JSON', () => {
            const out = renderPromptSnapshot({
                messages: [],
                tools: [{
                    name: 'recipe_patch',
                    description: 'Apply JSON Patch to ONE recipe.',
                    parameters: {type: 'object', properties: {recipeId: {type: 'string'}}}
                }]
            })

            expect(out).toContain('Apply JSON Patch to ONE recipe.')
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
