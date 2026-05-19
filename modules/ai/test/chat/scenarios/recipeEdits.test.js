const {concat, of} = require('rxjs')
const {emitChannel, guiAction} = require('#mcp/chat/channelEvents')
const {
    aToolFactoryHarness, aConversationHarness, aFakeGuiRequests, collect
} = require('../harness')

describe('recipe edits', () => {

    function metadataFor(metadata) {
        return aFakeGuiRequests(() => of(metadata))
    }

    const mosaicMetadata = {id: 'r1', type: 'MOSAIC', name: 'Kenya mosaic', projectId: 'p1'}
    const classificationMetadata = {id: 'r1', type: 'CLASSIFICATION', name: 'Kenya', projectId: 'p1'}
    const unspeccedMetadata = {id: 'r-other', type: 'NOT_IN_REGISTRY', name: 'Other', projectId: 'p1'}

    describe('describe_recipe tool', () => {

        describe('the tool descriptor', () => {
            let harness
            beforeEach(() => {
                harness = aToolFactoryHarness({specialist: 'describe_recipe'})
            })

            it('is named describe_recipe with recipeId required and question optional', () => {
                expect(harness.tool.name).toBe('describe_recipe')
                expect(harness.tool.parameters).toEqual({
                    type: 'object',
                    properties: {
                        recipeId: {type: 'string'},
                        question: {type: 'string'}
                    },
                    required: ['recipeId'],
                    additionalProperties: false
                })
            })

            it('steers the orchestrator off chaining describe before update', () => {
                expect(harness.tool.description).toMatch(/don't chain.*describe.*update/i)
            })

            it('opts into directAnswer so the orchestrator streams specialist prose verbatim', () => {
                expect(harness.tool.directAnswer).toBe(true)
            })
        })

        describe('seeding the specialist', () => {
            let harness
            beforeEach(() => {
                harness = aToolFactoryHarness({
                    specialist: 'describe_recipe',
                    replies: [{text: 'A 25-tree random-forest classifier.'}]
                })
            })

            it('returns the specialist answer as the tool result data', () => {
                const result = harness.invoke({recipeId: 'r1', question: 'which classifier?'})

                expect(result).toEqual({answer: 'A 25-tree random-forest classifier.'})
            })

            it('seeds the inner LLM with the recipe specialist system prompt', () => {
                harness.invoke({recipeId: 'r1', question: 'which classifier?'})

                expect(harness.llm.receivedMessages[0][0]).toEqual({
                    role: 'system',
                    content: expect.stringMatching(/recipe specialist/i)
                })
            })

            it('forwards recipeId and the optional question to the inner user message', () => {
                harness.invoke({recipeId: 'r1', question: 'which classifier?'})

                const userMessage = harness.llm.receivedMessages[0][1]
                expect(userMessage.role).toBe('user')
                expect(userMessage.content).toContain('r1')
                expect(userMessage.content).toMatch(/which classifier\?/)
            })

            it('issues a recipe-metadata GUI request to resolve the recipe type (not a recipe_load preflight)', () => {
                harness.invoke({recipeId: 'r1'})

                expect(harness.guiRequests.requests.map(request => request.action)).toEqual(['recipe-metadata'])
                expect(harness.innerTools.invocations).toEqual([])
            })

            it('treats each invocation as a fresh session — the second call sees only its own user message', () => {
                harness.invoke({recipeId: 'r1', question: 'first question'})
                harness.invoke({recipeId: 'r1', question: 'second question'})

                const secondCall = harness.llm.receivedMessages[1]
                expect(secondCall).toHaveLength(2)
                expect(secondCall[0].role).toBe('system')
                expect(secondCall[1].content).toContain('second question')
                expect(secondCall[1].content).not.toContain('first question')
            })
        })

        describe('allowed-tool scoping', () => {

            it('offers only recipe_load to the specialist even when other inner tools are registered', () => {
                const innerTools = innerToolsWithSchemas([
                    {name: 'recipe_load', description: 'Load.', parameters: {type: 'object', properties: {recipeId: {type: 'string'}}}},
                    {name: 'recipe_list', description: 'List.', parameters: {type: 'object', properties: {}}}
                ])
                const harness = aToolFactoryHarness({specialist: 'describe_recipe', innerTools})

                harness.invoke({recipeId: 'r1'})

                expect(harness.llm.receivedTools[0].map(schema => schema.name)).toEqual(['recipe_load'])
            })

            it('routes a recipe_load call through the inner registry when the specialist asks for it', () => {
                const recipeLoadCall = {id: 'rl1', name: 'recipe_load', input: {recipeId: 'r1'}}
                const harness = aToolFactoryHarness({
                    specialist: 'describe_recipe',
                    replies: [
                        {toolCalls: [recipeLoadCall]},
                        {text: 'CLASSIFICATION recipe.'}
                    ]
                })

                harness.invoke({recipeId: 'r1'})

                expect(harness.innerTools.invocations).toEqual([recipeLoadCall])
            })

            it('refuses recipe_load for a recipeId other than the one describe_recipe was asked about', () => {
                const wrongCall = {id: 'rl1', name: 'recipe_load', input: {recipeId: 'r999'}}
                const harness = aToolFactoryHarness({
                    specialist: 'describe_recipe',
                    replies: [
                        {toolCalls: [wrongCall]},
                        {text: 'cannot load.'}
                    ]
                })

                harness.invoke({recipeId: 'r1'})

                expect(harness.innerTools.invocations).toEqual([])
                const toolMessage = harness.llm.receivedMessages[1].find(message => message.role === 'tool')
                expect(toolMessage.toolResults[0].result).toEqual({
                    ok: false,
                    error: {code: 'RECIPE_SCOPE_VIOLATION', message: expect.stringContaining('r999')}
                })
            })

            it('refuses non-allowed tool calls with TOOL_NOT_ALLOWED so the specialist cannot escape its scope', () => {
                const escapeCall = {id: 't1', name: 'recipe_list', input: {}}
                const innerTools = innerToolsWithSchemas([
                    {name: 'recipe_load', description: 'Load.', parameters: {type: 'object', properties: {recipeId: {type: 'string'}}}},
                    {name: 'recipe_list', description: 'List.', parameters: {type: 'object', properties: {}}}
                ])
                const harness = aToolFactoryHarness({
                    specialist: 'describe_recipe',
                    innerTools,
                    replies: [
                        {toolCalls: [escapeCall]},
                        {text: 'blocked.'}
                    ]
                })

                harness.invoke({recipeId: 'r1'})

                expect(harness.innerTools.invocations).toEqual([])
                const toolMessage = harness.llm.receivedMessages[1].find(message => message.role === 'tool')
                expect(toolMessage.toolResults[0].result.error.code).toBe('TOOL_NOT_ALLOWED')
            })
        })

        describe('per-type prompt assembly', () => {

            it('on a MOSAIC recipe, the system prompt carries MOSAIC describeFacts and suppresses selection facts + edit guidance', () => {
                const harness = aToolFactoryHarness({
                    specialist: 'describe_recipe',
                    guiRequests: metadataFor(mosaicMetadata)
                })

                harness.invoke({recipeId: 'r-mosaic'})

                const systemPrompt = harness.llm.receivedMessages[0][0].content
                expect(systemPrompt).toMatch(/recipe specialist/i)
                expect(systemPrompt).toMatch(/MOSAIC/)
                expect(systemPrompt).toMatch(/Outputs:/i)
                expect(systemPrompt).not.toMatch(/Choose when:/i)
                expect(systemPrompt).not.toMatch(/Use cases:/i)
                expect(systemPrompt).not.toMatch(/Edit guidance:/i)
            })

            it('on an unknown recipe type, the system prompt is the base frame (no per-type facts)', () => {
                const harness = aToolFactoryHarness({
                    specialist: 'describe_recipe',
                    guiRequests: metadataFor(unspeccedMetadata)
                })

                harness.invoke({recipeId: 'r-other'})

                const systemPrompt = harness.llm.receivedMessages[0][0].content
                expect(systemPrompt).toMatch(/recipe specialist/i)
                expect(systemPrompt).not.toMatch(/Outputs:/i)
                expect(systemPrompt).not.toMatch(/Choose when:/i)
                expect(systemPrompt).not.toMatch(/Edit guidance:/i)
            })
        })
    })

    describe('update_recipe tool', () => {

        describe('the tool descriptor', () => {
            let harness
            beforeEach(() => {
                harness = aToolFactoryHarness({specialist: 'update_recipe'})
            })

            it('is named update_recipe with recipeId and instruction both required', () => {
                expect(harness.tool.name).toBe('update_recipe')
                expect(harness.tool.parameters).toEqual({
                    type: 'object',
                    properties: {
                        recipeId: {type: 'string'},
                        instruction: {type: 'string'}
                    },
                    required: ['recipeId', 'instruction'],
                    additionalProperties: false
                })
            })

            it('steers the orchestrator off chaining describe_recipe before update_recipe', () => {
                expect(harness.tool.description).toMatch(/don't.*describe_recipe.*first/i)
            })

            it('opts into directAnswer so the orchestrator streams specialist prose verbatim', () => {
                expect(harness.tool.directAnswer).toBe(true)
            })
        })

        describe('seeding the specialist', () => {
            let harness
            beforeEach(() => {
                harness = aToolFactoryHarness({specialist: 'update_recipe'})
            })

            it('preflights recipe-metadata before invoking the inner specialist LLM', () => {
                harness.invoke({recipeId: 'r1', instruction: 'change season end'})

                expect(harness.guiRequests.requests.map(request => request.action)).toEqual(['recipe-metadata'])
            })

            it('forwards recipeId and instruction to the inner user message', () => {
                harness.invoke({recipeId: 'r1', instruction: 'change season end to 2026-06-01'})

                const userMessage = harness.llm.receivedMessages[0][1]
                expect(userMessage.role).toBe('user')
                expect(userMessage.content).toContain('r1')
                expect(userMessage.content).toMatch(/change season end to 2026-06-01/)
            })
        })

        describe('allowed-tool scoping', () => {

            it('offers the specialist load_for_update and recipe_patch only (no raw recipe_load, no recipe_list)', () => {
                const innerTools = innerToolsWithSchemas([
                    {name: 'load_for_update', description: 'Closure.', parameters: {type: 'object', properties: {recipeId: {type: 'string'}, instruction: {type: 'string'}}}},
                    {name: 'recipe_load', description: 'Load.', parameters: {type: 'object', properties: {}}},
                    {name: 'recipe_patch', description: 'Patch.', parameters: {type: 'object', properties: {recipeId: {type: 'string'}, baseModelHash: {type: 'string'}, operations: {type: 'array'}}}},
                    {name: 'recipe_list', description: 'List.', parameters: {type: 'object', properties: {}}}
                ])
                const harness = aToolFactoryHarness({specialist: 'update_recipe', innerTools})

                harness.invoke({recipeId: 'r1', instruction: 'edit'})

                expect(harness.llm.receivedTools[0].map(schema => schema.name).sort()).toEqual(['load_for_update', 'recipe_patch'])
            })

            it('routes load_for_update and recipe_patch calls through the inner registry', () => {
                const loadCall = {id: 'tl1', name: 'load_for_update', input: {recipeId: 'r1', instruction: 'change target date'}}
                const patchCall = {id: 'tp1', name: 'recipe_patch', input: {
                    recipeId: 'r1', baseModelHash: 'h1',
                    operations: [{op: 'replace', path: '/dates/seasonEnd', value: '2026-06-01'}]
                }}
                const harness = aToolFactoryHarness({
                    specialist: 'update_recipe',
                    replies: [
                        {toolCalls: [loadCall]},
                        {toolCalls: [patchCall]},
                        {text: 'Done.'}
                    ]
                })

                harness.invoke({recipeId: 'r1', instruction: 'change target date'})

                expect(harness.innerTools.invocations).toEqual([loadCall, patchCall])
            })

            it('refuses recipe_patch and load_for_update calls for a different recipeId with RECIPE_SCOPE_VIOLATION', () => {
                const wrongPatch = {id: 'tp1', name: 'recipe_patch', input: {
                    recipeId: 'r999', baseModelHash: 'h1', operations: [{op: 'replace', path: '/x', value: 1}]
                }}
                const wrongLoad = {id: 'tl1', name: 'load_for_update', input: {recipeId: 'r999', instruction: 'edit'}}
                const harness = aToolFactoryHarness({
                    specialist: 'update_recipe',
                    replies: [
                        {toolCalls: [wrongPatch, wrongLoad]},
                        {text: 'cannot edit.'}
                    ]
                })

                harness.invoke({recipeId: 'r1', instruction: 'edit'})

                expect(harness.innerTools.invocations).toEqual([])
                const toolResults = harness.llm.receivedMessages[1].find(message => message.role === 'tool').toolResults
                expect(toolResults.map(result => result.result.error.code)).toEqual([
                    'RECIPE_SCOPE_VIOLATION', 'RECIPE_SCOPE_VIOLATION'
                ])
                expect(toolResults[0].result.error.message).toContain('r999')
            })

            it('refuses raw recipe_load entirely — update specialists must go through load_for_update', () => {
                const recipeLoadCall = {id: 'tl1', name: 'recipe_load', input: {recipeId: 'r1'}}
                const innerTools = innerToolsWithSchemas([
                    {name: 'load_for_update', description: 'Closure.', parameters: {type: 'object', properties: {recipeId: {type: 'string'}, instruction: {type: 'string'}}}},
                    {name: 'recipe_load', description: 'Load.', parameters: {type: 'object', properties: {}}},
                    {name: 'recipe_patch', description: 'Patch.', parameters: {type: 'object', properties: {recipeId: {type: 'string'}, baseModelHash: {type: 'string'}, operations: {type: 'array'}}}}
                ])
                const harness = aToolFactoryHarness({
                    specialist: 'update_recipe',
                    innerTools,
                    replies: [
                        {toolCalls: [recipeLoadCall]},
                        {text: 'blocked.'}
                    ]
                })

                harness.invoke({recipeId: 'r1', instruction: 'edit'})

                expect(harness.innerTools.invocations).toEqual([])
                const toolMessage = harness.llm.receivedMessages[1].find(message => message.role === 'tool')
                expect(toolMessage.toolResults[0].result.error.code).toBe('TOOL_NOT_ALLOWED')
            })
        })

        describe('outer envelope reflects whether the patch applied', () => {

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

                expect(result).toEqual({
                    ok: false,
                    error: {
                        code: 'UPDATE_NOT_ATTEMPTED',
                        message: 'The update specialist did not call recipe_patch.',
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

        describe('per-type prompt assembly', () => {

            it('on a MOSAIC recipe, the system prompt names load_for_update, carries MOSAIC edit guidance, and omits the full JSON schema', () => {
                const harness = aToolFactoryHarness({
                    specialist: 'update_recipe',
                    guiRequests: metadataFor(mosaicMetadata)
                })

                harness.invoke({recipeId: 'r-mosaic', instruction: 'edit'})

                const systemPrompt = harness.llm.receivedMessages[0][0].content
                expect(systemPrompt).toMatch(/update specialist/i)
                expect(systemPrompt).toMatch(/MOSAIC/)
                expect(systemPrompt).toMatch(/Edit guidance:/i)
                expect(systemPrompt).toContain('load_for_update')
                expect(systemPrompt).not.toContain('recipe_load')
                expect(systemPrompt).not.toMatch(/```json/)
                expect(systemPrompt).not.toMatch(/Choose when:/i)
                expect(systemPrompt).not.toMatch(/Use cases:/i)
            })

            it('on an unknown recipe type, the system prompt is the base frame (no per-type edit guidance)', () => {
                const harness = aToolFactoryHarness({
                    specialist: 'update_recipe',
                    guiRequests: metadataFor(unspeccedMetadata)
                })

                harness.invoke({recipeId: 'r-other', instruction: 'edit'})

                const systemPrompt = harness.llm.receivedMessages[0][0].content
                expect(systemPrompt).toMatch(/update specialist/i)
                expect(systemPrompt).not.toMatch(/Edit guidance:/i)
                expect(systemPrompt).not.toMatch(/```json/)
            })
        })

        describe('regressions and recovery', () => {

            it('runs the specialist exactly once when the metadata lookup interleaves a channel event before the data', () => {
                const guiRequests = aFakeGuiRequests(() => concat(
                    of(emitChannel(guiAction({requestId: 'req-1', action: 'recipe-metadata', params: {recipeId: 'r1'}}))),
                    of(mosaicMetadata)
                ))
                const harness = aToolFactoryHarness({
                    specialist: 'update_recipe',
                    guiRequests,
                    replies: [{text: 'Done.'}]
                })

                harness.invoke({recipeId: 'r1', instruction: 'change'})

                expect(harness.llm.receivedMessages).toHaveLength(1)
            })

            it('still returns an answer when the inner specialist emits an empty round before a useful one (stall recovery)', () => {
                const patchCall = {id: 'tp1', name: 'recipe_patch', input: {
                    recipeId: 'r1', baseModelHash: 'h1',
                    operations: [{op: 'replace', path: '/dates/seasonEnd', value: '2026-06-01'}]
                }}
                const harness = aToolFactoryHarness({
                    specialist: 'update_recipe',
                    replies: [
                        {text: ''},
                        {toolCalls: [patchCall]},
                        {text: 'Recovered and patched.'}
                    ]
                })

                const result = harness.invoke({recipeId: 'r1', instruction: 'edit'})

                expect(result).toEqual({ok: true, data: {answer: 'Recovered and patched.'}})
            })
        })

        describe('update_recipe.outcome bus event', () => {

            it('publishes a single outcome event with code=ok on the happy path (consumer-load-bearing for logListener routing)', () => {
                const patchCall = {id: 'tp1', name: 'recipe_patch', input: {
                    recipeId: 'r1', baseModelHash: 'h1',
                    operations: [{op: 'replace', path: '/dates/seasonEnd', value: '2026-06-01'}]
                }}
                const harness = aToolFactoryHarness({
                    specialist: 'update_recipe',
                    replies: [
                        {toolCalls: [patchCall]},
                        {text: 'Season end set.'}
                    ]
                })

                harness.invoke({recipeId: 'r1', instruction: 'edit'})

                const outcomes = harness.bus.events.filter(event => event.type === 'update_recipe.outcome')
                expect(outcomes).toHaveLength(1)
                expect(outcomes[0]).toMatchObject({type: 'update_recipe.outcome', code: 'ok'})
            })
        })
    })

    describe('directAnswer integration through the orchestrator', () => {

        const toolContext = {channel: {}, conversationId: 'conv-1', clientId: 'c1', subscriptionId: 's1'}

        it('streams describe_recipe specialist prose verbatim to the user without an orchestrator restate', async () => {
            const describeCall = {id: 'd1', name: 'describe_recipe', input: {recipeId: 'r1'}}
            const factory = aToolFactoryHarness({
                specialist: 'describe_recipe',
                guiRequests: metadataFor(classificationMetadata),
                replies: [{text: 'CLASSIFICATION recipe using a random forest.'}]
            })
            const conversation = aConversationHarness({
                replies: [
                    {toolCalls: [describeCall]},
                    {text: 'orchestrator restate that should never run'}
                ],
                tools: [factory.tool]
            })

            const events = await collect(conversation.send$('describe recipe r1', {toolContext}))

            expect(events.filter(event => event.textDelta)).toEqual([
                {textDelta: 'CLASSIFICATION recipe using a random forest.'}
            ])
            expect(conversation.llm.receivedMessages).toHaveLength(1)
        })

        it('streams update_recipe specialist prose verbatim to the user without an orchestrator restate', async () => {
            const updateCall = {id: 'u1', name: 'update_recipe', input: {recipeId: 'r1', instruction: 'set target date'}}
            const patchCall = {id: 'tp1', name: 'recipe_patch', input: {
                recipeId: 'r1', baseModelHash: 'h1',
                operations: [{op: 'replace', path: '/dates/targetDate', value: '2026-06-01'}]
            }}
            const factory = aToolFactoryHarness({
                specialist: 'update_recipe',
                replies: [
                    {toolCalls: [patchCall]},
                    {text: 'Target date set to 2026-06-01.'}
                ]
            })
            const conversation = aConversationHarness({
                replies: [
                    {toolCalls: [updateCall]},
                    {text: 'orchestrator restate that should never run'}
                ],
                tools: [factory.tool]
            })

            const events = await collect(conversation.send$('set target date', {toolContext}))

            expect(events.filter(event => event.textDelta)).toEqual([
                {textDelta: 'Target date set to 2026-06-01.'}
            ])
            expect(conversation.llm.receivedMessages).toHaveLength(1)
        })
    })
})

// Inner-registry double that only exposes the supplied schemas. Used to
// exercise the per-specialist scope filter without listing matching
// invoke$ implementations — the scoped wrapper blocks the call before
// it reaches an implementation.
function innerToolsWithSchemas(schemas) {
    return {
        invocations: [],
        schemas: () => schemas,
        invoke$(toolCall) {
            this.invocations.push(toolCall)
            return of({ok: true, data: {}})
        }
    }
}

// Inner-registry double with both schemas() and per-name invoke$
// implementations.
function innerToolsImpl(implementations, schemas) {
    const invocations = []
    return {
        invocations,
        schemas: () => schemas,
        invoke$(toolCall, context) {
            invocations.push(toolCall)
            const impl = implementations[toolCall.name]
            if (!impl) return of({ok: false, error: {code: 'UNKNOWN_TOOL', message: toolCall.name}})
            return impl(toolCall.input, context)
        }
    }
}
