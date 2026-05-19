const {concat, of, throwError} = require('rxjs')
const {updateRecipeTool} = require('#mcp/chat/specialists/recipeSpecialists')
const {emitChannel, guiAction} = require('#mcp/chat/channelEvents')
const {aFakeBus, aFakeGuiRequests, aFakeLlm, aFakeTools, read} = require('../builders')

describe('updateRecipeTool', () => {

    const loadForUpdateSchema = {
        name: 'load_for_update',
        description: 'Load + closure for ONE recipe.',
        parameters: {
            type: 'object',
            properties: {recipeId: {type: 'string'}, instruction: {type: 'string'}}
        }
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
    const recipeListSchema = {name: 'recipe_list', description: 'List.', parameters: {type: 'object'}}
    const recipeLoadSchema = {name: 'recipe_load', description: 'Load ONE recipe.', parameters: {type: 'object'}}

    function metadataReplyingWith(metadata) {
        return aFakeGuiRequests(() => of(metadata))
    }

    function aTool(overrides = {}) {
        const llm = overrides.llm ?? aFakeLlm({replies: [{text: 'Done.'}]})
        const innerTools = overrides.innerTools ?? aFakeTools(
            {
                load_for_update: () => of({baseModelHash: 'h1', intent: 'broad', currentValues: {}, dependentPaths: ['/'], guidance: []}),
                recipe_patch: () => of({summary: 'patched', modelHash: 'h2', invalidatedPaths: ['/dates/seasonEnd']})
            },
            [loadForUpdateSchema, recipePatchSchema]
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

    it('opts into directAnswer so the orchestrator streams the specialist prose verbatim instead of round-tripping for a restate', () => {
        const {tool} = aTool()

        expect(tool.directAnswer).toBe(true)
    })

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

    it('description steers the orchestrator off the describe_recipe pre-inspection chain (specialist loads current state internally)', () => {
        const {tool} = aTool()

        expect(tool.description).toMatch(/don't.*describe_recipe.*first/i)
    })

    it('throws at construction when the inner registry is missing load_for_update', () => {
        const innerTools = aFakeTools({recipe_patch: () => of({})}, [recipePatchSchema])

        expect(() => updateRecipeTool({
            llm: aFakeLlm(), bus: aFakeBus(), innerTools, guiRequests: aFakeGuiRequests()
        })).toThrow(/load_for_update/)
    })

    it('throws at construction when the inner registry is missing recipe_patch', () => {
        const innerTools = aFakeTools({load_for_update: () => of({})}, [loadForUpdateSchema])

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

        read(tool.invoke$({recipeId: 'r1', instruction: 'change season end to 2026-06-01'}, aContext()))

        const userMessage = llm.receivedMessages[0][1]
        expect(userMessage.role).toBe('user')
        expect(userMessage.content).toContain('r1')
        expect(userMessage.content).toMatch(/change season end to 2026-06-01/)
    })

    it('offers the specialist load_for_update and recipe_patch only (no raw recipe_load, no recipe_list)', () => {
        const innerTools = aFakeTools(
            {
                load_for_update: () => of({}),
                recipe_load: () => of({}),
                recipe_patch: () => of({}),
                recipe_list: () => of([])
            },
            [loadForUpdateSchema, recipeLoadSchema, recipePatchSchema, recipeListSchema]
        )
        const {tool, llm} = aTool({innerTools})

        read(tool.invoke$({recipeId: 'r1', instruction: 'do thing'}, aContext()))

        expect(llm.receivedTools[0].map(s => s.name).sort()).toEqual(['load_for_update', 'recipe_patch'])
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

    it('lets the inner LLM call load_for_update through the inner registry', () => {
        const loadCall = {id: 'tl1', name: 'load_for_update', input: {recipeId: 'r1', instruction: 'change target date'}}
        const llm = aFakeLlm({replies: [
            {toolCalls: [loadCall]},
            {text: 'noted.'}
        ]})
        const {tool, innerTools} = aTool({llm})

        read(tool.invoke$({recipeId: 'r1', instruction: 'change target date'}, aContext()))

        expect(innerTools.invocations).toEqual([loadCall])
    })

    it('refuses recipe_patch calls for a recipeId other than the one update_recipe was asked about', () => {
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

    it('refuses load_for_update calls for a recipeId other than the one update_recipe was asked about (same scope rule)', () => {
        const wrongCall = {id: 'tl1', name: 'load_for_update', input: {recipeId: 'r999', instruction: 'edit'}}
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

    it('refuses raw recipe_load entirely — update specialists must use load_for_update, not the read-side tool', () => {
        const recipeLoadCall = {id: 'tl1', name: 'recipe_load', input: {recipeId: 'r1'}}
        const llm = aFakeLlm({replies: [
            {toolCalls: [recipeLoadCall]},
            {text: 'blocked.'}
        ]})
        const innerTools = aFakeTools(
            {
                load_for_update: () => of({}),
                recipe_load: () => of({}),
                recipe_patch: () => of({})
            },
            [loadForUpdateSchema, recipeLoadSchema, recipePatchSchema]
        )
        const {tool} = aTool({llm, innerTools})

        read(tool.invoke$({recipeId: 'r1', instruction: 'edit'}, aContext()))

        expect(innerTools.invocations).toEqual([])
        const toolMessage = llm.receivedMessages[1].find(m => m.role === 'tool')
        expect(toolMessage.toolResults[0].result.error.code).toBe('TOOL_NOT_ALLOWED')
    })

    it('refuses non-allowed tool calls so the specialist cannot escape its scope', () => {
        const escapeCall = {id: 'tx', name: 'recipe_list', input: {}}
        const llm = aFakeLlm({replies: [
            {toolCalls: [escapeCall]},
            {text: 'blocked.'}
        ]})
        const innerTools = aFakeTools(
            {
                load_for_update: () => of({}),
                recipe_patch: () => of({}),
                recipe_list: () => of([])
            },
            [loadForUpdateSchema, recipePatchSchema, recipeListSchema]
        )
        const {tool} = aTool({llm, innerTools})

        read(tool.invoke$({recipeId: 'r1', instruction: 'edit'}, aContext()))

        expect(innerTools.invocations).toEqual([])
        const toolMessage = llm.receivedMessages[1].find(m => m.role === 'tool')
        expect(toolMessage.toolResults[0].result.error.code).toBe('TOOL_NOT_ALLOWED')
    })

    describe('outer envelope reflects whether the patch actually applied', () => {

        const patchOp = {op: 'replace', path: '/dates/seasonEnd', value: '2026-06-01'}
        const closureResult = {baseModelHash: 'h1', intent: 'dateWindow', currentValues: {}, dependentPaths: ['/dates/seasonEnd'], guidance: []}

        function aSpecialistThatCalls(patchCalls, finalText) {
            const replies = patchCalls.map((op, i) => ({toolCalls: [{id: `tp${i}`, name: 'recipe_patch', input: {
                recipeId: 'r1', baseModelHash: 'h1', operations: [op]
            }}]}))
            replies.push({text: finalText})
            return aFakeLlm({replies: [
                {toolCalls: [{id: 'tl1', name: 'load_for_update', input: {recipeId: 'r1', instruction: 'edit'}}]},
                ...replies
            ]})
        }

        function aTools(patchResults) {
            let i = 0
            return aFakeTools(
                {
                    load_for_update: () => of(closureResult),
                    recipe_patch: () => of(patchResults[i++])
                },
                [loadForUpdateSchema, recipePatchSchema]
            )
        }

        it('returns {ok: true, data: {answer}} when recipe_patch succeeded', () => {
            const {tool} = aTool({
                llm: aSpecialistThatCalls([patchOp], 'Season end set to 2026-06-01.'),
                innerTools: aTools([{ok: true, data: {summary: 'patched', modelHash: 'h2', invalidatedPaths: ['/dates/seasonEnd']}}])
            })

            const result = read(tool.invoke$({recipeId: 'r1', instruction: 'edit'}, aContext()))

            expect(result).toEqual({ok: true, data: {answer: 'Season end set to 2026-06-01.'}})
        })

        it('returns {ok: false, error: UPDATE_FAILED} carrying the patch error when recipe_patch returned ok:false', () => {
            const patchError = {code: 'PATCH_APPLY_FAILED', message: 'path not found: /dates/seasonEnd'}
            const {tool} = aTool({
                llm: aSpecialistThatCalls([patchOp], 'I tried but the patch failed.'),
                innerTools: aTools([{ok: false, error: patchError}])
            })

            const result = read(tool.invoke$({recipeId: 'r1', instruction: 'edit'}, aContext()))

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

        it('returns {ok: false, error: UPDATE_NOT_ATTEMPTED} when the specialist never called recipe_patch', () => {
            const llm = aFakeLlm({replies: [
                {toolCalls: [{id: 'tl1', name: 'load_for_update', input: {recipeId: 'r1', instruction: 'edit'}}]},
                {text: 'I looked at the recipe but did not patch anything.'}
            ]})
            const innerTools = aFakeTools(
                {load_for_update: () => of(closureResult)},
                [loadForUpdateSchema, recipePatchSchema]
            )
            const {tool} = aTool({llm, innerTools})

            const result = read(tool.invoke$({recipeId: 'r1', instruction: 'edit'}, aContext()))

            expect(result).toEqual({
                ok: false,
                error: {
                    code: 'UPDATE_NOT_ATTEMPTED',
                    message: 'The update specialist did not call recipe_patch.',
                    specialistAnswer: 'I looked at the recipe but did not patch anything.'
                }
            })
        })

        it('returns success when a later patch succeeds even if an earlier one failed (the user got the update)', () => {
            const badPatch = {op: 'replace', path: '/dates/seasonEnd', value: 'not-a-date'}
            const goodPatch = {op: 'replace', path: '/dates/seasonEnd', value: '2026-06-01'}
            const patchError = {code: 'VALIDATION_FAILED', message: 'bad', errors: []}
            const llm = aFakeLlm({replies: [
                {toolCalls: [{id: 'tl1', name: 'load_for_update', input: {recipeId: 'r1', instruction: 'edit'}}]},
                {toolCalls: [{id: 'tp0', name: 'recipe_patch', input: {recipeId: 'r1', baseModelHash: 'h1', operations: [badPatch]}}]},
                {toolCalls: [{id: 'tp1', name: 'recipe_patch', input: {recipeId: 'r1', baseModelHash: 'h1', operations: [goodPatch]}}]},
                {text: 'Got it on the second try.'}
            ]})
            const {tool} = aTool({llm, innerTools: aTools([
                {ok: false, error: patchError},
                {ok: true, data: {summary: 'patched', modelHash: 'h3', invalidatedPaths: ['/dates/seasonEnd']}}
            ])})

            const result = read(tool.invoke$({recipeId: 'r1', instruction: 'edit'}, aContext()))

            expect(result).toEqual({ok: true, data: {answer: 'Got it on the second try.'}})
        })

        it('leaves enough specialist rounds for three patch attempts after the initial load_for_update', () => {
            const badPatch1 = {op: 'replace', path: '/dates/seasonEnd', value: 'not-a-date'}
            const badPatch2 = {op: 'replace', path: '/dates/seasonEnd', value: '2020-01-01'}
            const goodPatch = {op: 'replace', path: '/dates/seasonEnd', value: '2026-06-01'}
            const patchError = {code: 'VALIDATION_FAILED', message: 'bad', errors: []}
            const llm = aFakeLlm({replies: [
                {toolCalls: [{id: 'tl1', name: 'load_for_update', input: {recipeId: 'r1', instruction: 'edit'}}]},
                {toolCalls: [{id: 'tp0', name: 'recipe_patch', input: {recipeId: 'r1', baseModelHash: 'h1', operations: [badPatch1]}}]},
                {toolCalls: [{id: 'tp1', name: 'recipe_patch', input: {recipeId: 'r1', baseModelHash: 'h1', operations: [badPatch2]}}]},
                {toolCalls: [{id: 'tp2', name: 'recipe_patch', input: {recipeId: 'r1', baseModelHash: 'h1', operations: [goodPatch]}}]},
                {text: 'Got it on the third try.'}
            ]})
            const {tool} = aTool({llm, innerTools: aTools([
                {ok: false, error: patchError},
                {ok: false, error: patchError},
                {ok: true, data: {summary: 'patched', modelHash: 'h3', invalidatedPaths: ['/dates/seasonEnd']}}
            ])})

            const result = read(tool.invoke$({recipeId: 'r1', instruction: 'edit'}, aContext()))

            expect(result).toEqual({ok: true, data: {answer: 'Got it on the third try.'}})
        })

        it('returns success when a corrective patch is emitted in the final specialist round and uses the patch summary as fallback answer', () => {
            const removeS2 = {op: 'remove', path: '/sources/dataSets/SENTINEL_2'}
            const medoid = {op: 'replace', path: '/compositeOptions/compose', value: 'MEDOID'}
            const removeCalibrate = {op: 'remove', path: '/compositeOptions/corrections'}
            const removeS2CloudScore = {op: 'remove', path: '/compositeOptions/includedCloudMasking/sentinel2CloudScorePlus'}
            const patchError = {code: 'VALIDATION_FAILED', message: 'bad', errors: [
                {path: '/compositeOptions/corrections', message: 'CALIBRATE requires both LANDSAT and SENTINEL_2 source groups'},
                {path: '/compositeOptions/includedCloudMasking', message: 'sentinel2CloudScorePlus requires SENTINEL_2'}
            ]}
            const llm = aFakeLlm({replies: [
                {toolCalls: [{id: 'tl1', name: 'load_for_update', input: {recipeId: 'r1', instruction: 'edit'}}]},
                {text: ''},
                {toolCalls: [{id: 'tp0', name: 'recipe_patch', input: {recipeId: 'r1', baseModelHash: 'h1', operations: [removeS2, medoid]}}]},
                {text: ''},
                {toolCalls: [{id: 'tp1', name: 'recipe_patch', input: {recipeId: 'r1', baseModelHash: 'h1', operations: [removeS2, medoid, removeCalibrate, removeS2CloudScore]}}]}
            ]})
            const bus = aFakeBus()
            const {tool} = aTool({llm, bus, innerTools: aTools([
                {ok: false, error: patchError},
                {ok: true, data: {summary: 'Recipe updated.', modelHash: 'h3', invalidatedPaths: ['/sources', '/compositeOptions']}}
            ])})

            const result = read(tool.invoke$({recipeId: 'r1', instruction: 'edit'}, aContext()))

            expect(result).toEqual({ok: true, data: {answer: 'Recipe updated.'}})
            const outcomes = bus.published.filter(e => e.type === 'update_recipe.outcome')
            expect(outcomes).toHaveLength(1)
            expect(outcomes[0]).toMatchObject({
                patchAttempted: true,
                patchSucceeded: true,
                code: 'ok',
                answerChars: 'Recipe updated.'.length
            })
        })
    })

    describe('per-type system prompt assembly', () => {

        it('on a MOSAIC recipe, the inner LLM system prompt carries MOSAIC edit guidance but not the full JSON Schema (load_for_update supplies the scoped closure)', () => {
            const guiRequests = metadataReplyingWith({id: 'r-mosaic', type: 'MOSAIC', name: 'Kenya mosaic', projectId: 'p1'})
            const {tool, llm} = aTool({guiRequests})

            read(tool.invoke$({recipeId: 'r-mosaic', instruction: 'edit'}, aContext()))

            const systemMessage = llm.receivedMessages[0][0]
            expect(systemMessage.role).toBe('system')
            expect(systemMessage.content).toContain('update specialist')
            expect(systemMessage.content).toContain('MOSAIC')
            expect(systemMessage.content).toMatch(/Edit guidance:/)
            expect(systemMessage.content).toMatch(/seasonStart/)
            expect(systemMessage.content).not.toMatch(/```json/)
            expect(systemMessage.content).not.toContain('"compositeOptions"')
        })

        it('the update-specialist prompt names load_for_update (not raw recipe_load) so the LLM uses the closure path', () => {
            const {tool, llm} = aTool()

            read(tool.invoke$({recipeId: 'r1', instruction: 'edit'}, aContext()))

            const systemMessage = llm.receivedMessages[0][0]
            expect(systemMessage.content).toContain('load_for_update')
            expect(systemMessage.content).not.toContain('recipe_load')
        })

        it('update prompt does not leak selection facts (chooseWhen / useCases) — they belong to the orchestrator selection step', () => {
            const guiRequests = metadataReplyingWith({id: 'r-mosaic', type: 'MOSAIC', name: 'Kenya mosaic', projectId: 'p1'})
            const {tool, llm} = aTool({guiRequests})

            read(tool.invoke$({recipeId: 'r-mosaic', instruction: 'edit'}, aContext()))

            const systemMessage = llm.receivedMessages[0][0]
            expect(systemMessage.content).not.toMatch(/Choose when:/)
            expect(systemMessage.content).not.toMatch(/Use cases:/)
        })

        it('on an unknown recipe type, the inner LLM system prompt is the unmodified base frame (no facts, no schema)', () => {
            const guiRequests = metadataReplyingWith({id: 'r-other', type: 'NOT_IN_REGISTRY', name: 'Other', projectId: 'p1'})
            const {tool, llm} = aTool({guiRequests})

            read(tool.invoke$({recipeId: 'r-other', instruction: 'edit'}, aContext()))

            const systemMessage = llm.receivedMessages[0][0]
            expect(systemMessage.content).toContain('update specialist')
            expect(systemMessage.content).not.toMatch(/Edit guidance:/)
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

    it('runs the specialist exactly once when the metadata lookup emits a channel event before the data (regression: dispatcher firing on channel emissions)', () => {
        const metadata = {id: 'r1', type: 'MOSAIC', name: 'Kenya', projectId: 'p1'}
        // Mirror real guiRequests behaviour: channel event first, then the outcome.
        const guiRequests = aFakeGuiRequests(() => concat(
            of(emitChannel(guiAction({requestId: 'req-1', action: 'recipe-metadata', params: {recipeId: 'r1'}}))),
            of(metadata)
        ))
        const {tool, llm} = aTool({guiRequests})

        read(tool.invoke$({recipeId: 'r1', instruction: 'change'}, aContext()))

        // One specialist invocation = one system+user pair sent to the inner LLM.
        // Pre-fix the channel emission also triggered a specialist run, producing two.
        expect(llm.receivedMessages.length).toBe(1)
    })

    describe('update_recipe.outcome bus event', () => {

        const patchOp = {op: 'replace', path: '/dates/seasonEnd', value: '2026-06-01'}
        const closureResult = {baseModelHash: 'h1', intent: 'dateWindow', currentValues: {}, dependentPaths: ['/dates/seasonEnd'], guidance: []}

        function aSpecialist({patchResults, finalText, omitLoad = false, omitPatch = false}) {
            const llmReplies = []
            if (!omitLoad) llmReplies.push({toolCalls: [{id: 'tl1', name: 'load_for_update', input: {recipeId: 'r1', instruction: 'edit'}}]})
            patchResults.forEach((_, i) => llmReplies.push({toolCalls: [{id: `tp${i}`, name: 'recipe_patch', input: {
                recipeId: 'r1', baseModelHash: 'h1', operations: [patchOp]
            }}]}))
            llmReplies.push({text: finalText})
            const llm = aFakeLlm({replies: llmReplies})
            const innerToolMap = omitPatch
                ? {load_for_update: () => of(closureResult)}
                : {
                    load_for_update: () => of(closureResult),
                    recipe_patch: (() => {
                        let i = 0
                        return () => of(patchResults[i++])
                    })()
                }
            const innerTools = aFakeTools(innerToolMap, [loadForUpdateSchema, recipePatchSchema])
            return {llm, innerTools}
        }

        it('publishes patchAttempted=true, patchSucceeded=true, code=ok, answerChars when the patch applied', () => {
            const bus = aFakeBus()
            const {llm, innerTools} = aSpecialist({
                patchResults: [{ok: true, data: {summary: 'patched', modelHash: 'h2', invalidatedPaths: ['/dates/seasonEnd']}}],
                finalText: 'Season end set.'
            })
            const {tool} = aTool({llm, innerTools, bus})

            read(tool.invoke$({recipeId: 'r1', instruction: 'edit'}, aContext()))

            const outcomes = bus.published.filter(e => e.type === 'update_recipe.outcome')
            expect(outcomes).toHaveLength(1)
            expect(outcomes[0]).toMatchObject({
                recipeId: 'r1',
                patchAttempted: true,
                patchSucceeded: true,
                code: 'ok',
                answerChars: 'Season end set.'.length
            })
        })

        it('publishes UPDATE_NOT_ATTEMPTED with patchAttempted=false when the specialist never called recipe_patch', () => {
            const bus = aFakeBus()
            const {llm, innerTools} = aSpecialist({
                patchResults: [],
                finalText: 'I looked but did not edit.',
                omitPatch: true
            })
            const {tool} = aTool({llm, innerTools, bus})

            read(tool.invoke$({recipeId: 'r1', instruction: 'edit'}, aContext()))

            const outcomes = bus.published.filter(e => e.type === 'update_recipe.outcome')
            expect(outcomes).toHaveLength(1)
            expect(outcomes[0]).toMatchObject({
                recipeId: 'r1',
                patchAttempted: false,
                patchSucceeded: false,
                code: 'UPDATE_NOT_ATTEMPTED',
                answerChars: 'I looked but did not edit.'.length
            })
        })

        it('publishes a preflight-failure outcome when recipe-metadata lookup fails (so every update_recipe dispatch leaves an outcome event)', () => {
            const bus = aFakeBus()
            const codedError = Object.assign(new Error('Recipe not found: r1'), {code: 'RECIPE_NOT_FOUND'})
            const guiRequests = aFakeGuiRequests(() => throwError(() => codedError))
            const {tool} = aTool({guiRequests, bus})

            read(tool.invoke$({recipeId: 'r1', instruction: 'edit'}, aContext()))

            const outcomes = bus.published.filter(e => e.type === 'update_recipe.outcome')
            expect(outcomes).toHaveLength(1)
            expect(outcomes[0]).toMatchObject({
                recipeId: 'r1',
                patchAttempted: false,
                patchSucceeded: false,
                code: 'RECIPE_NOT_FOUND',
                answerChars: 0
            })
        })

        it('publishes a preflight-failure outcome with the bridge fallback code (TOOL_FAILED) when the GUI bridge errors without a structured code', () => {
            const bus = aFakeBus()
            const guiRequests = aFakeGuiRequests(() => throwError(() => new Error('GUI gone')))
            const {tool} = aTool({guiRequests, bus})

            read(tool.invoke$({recipeId: 'r1', instruction: 'edit'}, aContext()))

            const outcomes = bus.published.filter(e => e.type === 'update_recipe.outcome')
            expect(outcomes).toHaveLength(1)
            expect(outcomes[0]).toMatchObject({
                code: 'TOOL_FAILED',
                patchAttempted: false,
                patchSucceeded: false
            })
        })

        it('publishes UPDATE_FAILED with patchAttempted=true and the last patch error code when recipe_patch returned ok:false', () => {
            const bus = aFakeBus()
            const {llm, innerTools} = aSpecialist({
                patchResults: [{ok: false, error: {code: 'VALIDATION_FAILED', message: 'bad'}}],
                finalText: 'Could not apply.'
            })
            const {tool} = aTool({llm, innerTools, bus})

            read(tool.invoke$({recipeId: 'r1', instruction: 'edit'}, aContext()))

            const outcomes = bus.published.filter(e => e.type === 'update_recipe.outcome')
            expect(outcomes).toHaveLength(1)
            expect(outcomes[0]).toMatchObject({
                recipeId: 'r1',
                patchAttempted: true,
                patchSucceeded: false,
                code: 'UPDATE_FAILED',
                lastPatchErrorCode: 'VALIDATION_FAILED'
            })
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
