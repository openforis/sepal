const {of, throwError} = require('rxjs')
const {updateRecipeTool} = require('#mcp/chat/specialists/recipeSpecialists')
const {aFakeBus, aFakeGuiRequests, aFakeLlm, aFakeTools, read} = require('../builders')

describe('updateRecipeTool', () => {

    const recipeLoadSchema = {
        name: 'recipe_load',
        description: 'Load ONE recipe.',
        parameters: {type: 'object', properties: {recipeId: {type: 'string'}}}
    }
    const recipePatchSchema = {
        name: 'recipe_patch',
        description: 'Apply JSON Patch to ONE recipe.',
        parameters: {
            type: 'object',
            properties: {
                recipeId: {type: 'string'},
                baseModelHash: {type: 'string'},
                operations: {type: 'array'}
            }
        }
    }

    function metadataReplyingWith(metadata) {
        return aFakeGuiRequests(() => of(metadata))
    }

    function aTool(overrides = {}) {
        const llm = overrides.llm ?? aFakeLlm({replies: [{text: 'Done.'}]})
        const innerTools = overrides.innerTools ?? aFakeTools(
            {
                recipe_load: () => of({id: 'r1', type: 'MOSAIC', model: {dates: {seasonEnd: '2025-01-01'}}, modelHash: 'h1'}),
                recipe_patch: () => of({summary: 'patched', modelHash: 'h2', invalidatedPaths: ['/dates/seasonEnd']})
            },
            [recipeLoadSchema, recipePatchSchema]
        )
        const guiRequests = overrides.guiRequests ?? metadataReplyingWith({id: 'r1', type: 'MOSAIC', name: 'Kenya', projectId: 'p1'})
        const tool = updateRecipeTool({
            llm,
            bus: overrides.bus ?? aFakeBus(),
            innerTools,
            guiRequests
        })
        return {tool, llm, innerTools, guiRequests}
    }

    function aContext() {
        return {channel: {}, conversationId: 'c1'}
    }

    it('exposes an update_recipe tool with recipeId and instruction both required', () => {
        const {tool} = aTool()

        expect(tool.name).toBe('update_recipe')
        expect(typeof tool.description).toBe('string')
        expect(tool.parameters).toEqual({
            type: 'object',
            properties: {
                recipeId: {type: 'string'},
                instruction: {type: 'string'}
            },
            required: ['recipeId', 'instruction'],
            additionalProperties: false
        })
    })

    it('throws at construction when the inner registry is missing recipe_load', () => {
        const innerTools = aFakeTools({recipe_patch: () => of({})}, [recipePatchSchema])

        expect(() => updateRecipeTool({
            llm: aFakeLlm(), bus: aFakeBus(), innerTools, guiRequests: aFakeGuiRequests()
        })).toThrow(/recipe_load/)
    })

    it('throws at construction when the inner registry is missing recipe_patch', () => {
        const innerTools = aFakeTools({recipe_load: () => of({})}, [recipeLoadSchema])

        expect(() => updateRecipeTool({
            llm: aFakeLlm(), bus: aFakeBus(), innerTools, guiRequests: aFakeGuiRequests()
        })).toThrow(/recipe_patch/)
    })

    it('preflights recipe-metadata to resolve the recipe type before invoking the specialist', () => {
        const guiRequests = metadataReplyingWith({id: 'r1', type: 'MOSAIC', name: 'Kenya', projectId: 'p1'})
        const {tool} = aTool({guiRequests})

        read(tool.invoke$({recipeId: 'r1', instruction: 'change season end'}, aContext()))

        expect(guiRequests.requests.map(r => r.action)).toEqual(['recipe-metadata'])
    })

    it('passes recipeId and instruction to the inner LLM in the user message', () => {
        const {tool, llm} = aTool()

        read(tool.invoke$({recipeId: 'r1', instruction: 'change the target date to 2026-06-01'}, aContext()))

        const userMessage = llm.receivedMessages[0][1]
        expect(userMessage.role).toBe('user')
        expect(userMessage.content).toContain('r1')
        expect(userMessage.content).toMatch(/change the target date to 2026-06-01/)
    })

    it('offers the specialist both recipe_load and recipe_patch (and nothing else from the inner registry)', () => {
        const innerTools = aFakeTools(
            {
                recipe_load: () => of({}),
                recipe_patch: () => of({}),
                recipe_list: () => of([])
            },
            [recipeLoadSchema, recipePatchSchema, {name: 'recipe_list', description: 'List.', parameters: {type: 'object'}}]
        )
        const {tool, llm} = aTool({innerTools})

        read(tool.invoke$({recipeId: 'r1', instruction: 'do thing'}, aContext()))

        expect(llm.receivedTools[0].map(s => s.name).sort()).toEqual(['recipe_load', 'recipe_patch'])
    })

    it('lets the inner LLM call recipe_patch through the inner registry', () => {
        const patchCall = {id: 'tp1', name: 'recipe_patch', input: {
            recipeId: 'r1',
            baseModelHash: 'h1',
            operations: [{op: 'replace', path: '/dates/seasonEnd', value: '2026-06-01'}]
        }}
        const llm = aFakeLlm({replies: [
            {toolCalls: [patchCall]},
            {text: 'Season end is now 2026-06-01.'}
        ]})
        const {tool, innerTools} = aTool({llm})

        read(tool.invoke$({recipeId: 'r1', instruction: 'change season end'}, aContext()))

        expect(innerTools.invocations).toEqual([patchCall])
    })

    it("refuses recipe_patch calls for a recipeId other than the one update_recipe was asked about", () => {
        const wrongCall = {id: 'tp1', name: 'recipe_patch', input: {
            recipeId: 'r999', baseModelHash: 'h1', operations: [{op: 'replace', path: '/x', value: 1}]
        }}
        const llm = aFakeLlm({replies: [
            {toolCalls: [wrongCall]},
            {text: 'cannot patch.'}
        ]})
        const {tool, innerTools} = aTool({llm})

        read(tool.invoke$({recipeId: 'r1', instruction: 'edit'}, aContext()))

        expect(innerTools.invocations).toEqual([])
        const toolMessage = llm.receivedMessages[1].find(m => m.role === 'tool')
        expect(toolMessage.toolResults[0].result).toEqual({
            ok: false,
            error: {
                code: 'RECIPE_SCOPE_VIOLATION',
                message: expect.stringContaining('r999')
            }
        })
    })

    it('refuses recipe_load calls for a recipeId other than the one update_recipe was asked about (same scope rule)', () => {
        const wrongCall = {id: 'rl1', name: 'recipe_load', input: {recipeId: 'r999'}}
        const llm = aFakeLlm({replies: [
            {toolCalls: [wrongCall]},
            {text: 'cannot load.'}
        ]})
        const {tool, innerTools} = aTool({llm})

        read(tool.invoke$({recipeId: 'r1', instruction: 'edit'}, aContext()))

        expect(innerTools.invocations).toEqual([])
        const toolMessage = llm.receivedMessages[1].find(m => m.role === 'tool')
        expect(toolMessage.toolResults[0].result.error.code).toBe('RECIPE_SCOPE_VIOLATION')
    })

    it('refuses non-allowed tool calls so the specialist cannot escape its scope', () => {
        const escapeCall = {id: 'tx', name: 'recipe_list', input: {}}
        const llm = aFakeLlm({replies: [
            {toolCalls: [escapeCall]},
            {text: 'blocked.'}
        ]})
        const innerTools = aFakeTools(
            {
                recipe_load: () => of({}),
                recipe_patch: () => of({}),
                recipe_list: () => of([])
            },
            [recipeLoadSchema, recipePatchSchema, {name: 'recipe_list', description: 'List.', parameters: {type: 'object'}}]
        )
        const {tool} = aTool({llm, innerTools})

        read(tool.invoke$({recipeId: 'r1', instruction: 'edit'}, aContext()))

        expect(innerTools.invocations).toEqual([])
        const toolMessage = llm.receivedMessages[1].find(m => m.role === 'tool')
        expect(toolMessage.toolResults[0].result.error.code).toBe('TOOL_NOT_ALLOWED')
    })

    it('returns the specialist final reply as the tool result, not the raw patch result', () => {
        const patchResult = {summary: 'patched', modelHash: 'h2', invalidatedPaths: ['/dates/seasonEnd']}
        const llm = aFakeLlm({replies: [
            {toolCalls: [{id: 'tp1', name: 'recipe_patch', input: {
                recipeId: 'r1', baseModelHash: 'h1', operations: [{op: 'replace', path: '/dates/seasonEnd', value: '2026-06-01'}]
            }}]},
            {text: 'Season end set to 2026-06-01.'}
        ]})
        const innerTools = aFakeTools(
            {
                recipe_load: () => of({id: 'r1', type: 'MOSAIC', model: {}, modelHash: 'h1'}),
                recipe_patch: () => of(patchResult)
            },
            [recipeLoadSchema, recipePatchSchema]
        )
        const {tool} = aTool({llm, innerTools})

        const result = read(tool.invoke$({recipeId: 'r1', instruction: 'edit'}, aContext()))

        expect(result).toEqual({answer: 'Season end set to 2026-06-01.'})
        expect(result).not.toMatchObject(patchResult)
    })

    describe('per-type system prompt assembly', () => {

        it('on a MOSAIC recipe, the inner LLM system prompt carries facts AND the JSON Schema (write specialist needs it to plan patches)', () => {
            const guiRequests = metadataReplyingWith({id: 'r-mosaic', type: 'MOSAIC', name: 'Kenya mosaic', projectId: 'p1'})
            const {tool, llm} = aTool({guiRequests})

            read(tool.invoke$({recipeId: 'r-mosaic', instruction: 'edit'}, aContext()))

            const systemMessage = llm.receivedMessages[0][0]
            expect(systemMessage.role).toBe('system')
            expect(systemMessage.content).toContain('update specialist')
            expect(systemMessage.content).toContain('MOSAIC')
            expect(systemMessage.content).toMatch(/Choose when:/)
            expect(systemMessage.content).toMatch(/```json/)
            expect(systemMessage.content).toContain('compositeOptions')
        })

        it('on an unknown recipe type, the inner LLM system prompt is the unmodified base frame (no facts, no schema)', () => {
            const guiRequests = metadataReplyingWith({id: 'r-other', type: 'NOT_IN_REGISTRY', name: 'Other', projectId: 'p1'})
            const {tool, llm} = aTool({guiRequests})

            read(tool.invoke$({recipeId: 'r-other', instruction: 'edit'}, aContext()))

            const systemMessage = llm.receivedMessages[0][0]
            expect(systemMessage.content).toContain('update specialist')
            expect(systemMessage.content).not.toMatch(/Choose when:/)
            expect(systemMessage.content).not.toMatch(/```json/)
        })

        it('when the metadata lookup fails, the orchestrator gets the failure envelope and the inner specialist is not invoked', () => {
            const guiRequests = aFakeGuiRequests(() => throwError(() => new Error('GUI gone')))
            const {tool, llm} = aTool({guiRequests})

            const result = read(tool.invoke$({recipeId: 'r1', instruction: 'edit'}, aContext()))

            expect(result).toEqual({
                ok: false,
                error: expect.objectContaining({code: 'TOOL_FAILED', message: 'GUI gone'})
            })
            expect(llm.receivedMessages).toEqual([])
        })
    })

    // Visibility only — no assertion. Lets us watch the §3 budget as schema/facts evolve.
    describe('DESIGN §3 prompt-byte budget — target 15 KB', () => {

        it('reports the assembled MOSAIC update-specialist system prompt size', () => {
            const {tool, llm} = aTool({
                guiRequests: metadataReplyingWith({id: 'r1', type: 'MOSAIC', name: 'Kenya mosaic', projectId: 'p1'})
            })

            read(tool.invoke$({recipeId: 'r1', instruction: 'change season end'}, aContext()))

            const systemMessage = llm.receivedMessages[0][0]
            // eslint-disable-next-line no-console
            console.log(`update-specialist-prompt MOSAIC ${systemMessage.content.length}B`)
        })
    })
})
