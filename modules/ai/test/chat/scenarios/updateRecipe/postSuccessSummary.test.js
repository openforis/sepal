const {of} = require('rxjs')
const {aToolFactoryHarness, aFakeLlm, innerToolsImpl, AOI_INNER_TOOL_SCHEMAS, AOI_INNER_TOOL_IMPLS} = require('../../harness')

// Local thinking models sometimes emit reasoning then end the turn with no
// visible content after a successful update. The specialist's final answer is
// then empty, and the deterministic fallback is a robotic tool summary. One
// response-only summarizer pass turns the successful update into user-facing
// prose. Routing the fake LLM by tool-presence separates the specialist loop
// (always tool-bearing) from the tool-free summarizer call.
describe('update_recipe summarizes a successful update when the specialist answers empty', () => {

    const updateCall = {id: 'tu1', name: 'update_recipe_values', input: {
        recipeId: 'r1', baseModelHash: 'h-base',
        writableHandles: ['datasets', 'corrections', 'sceneSelection'],
        values: {datasets: {LANDSAT: ['LANDSAT_9']}}
    }}
    const successData = {summary: 'Updated 1 handle', modelHash: 'h-next', appliedHandles: ['datasets'], invalidatedPaths: ['/sources/dataSets']}

    function updaterInnerTools(result = {ok: true, data: successData}) {
        return innerToolsImpl(
            {
                update_recipe_values: () => of(result),
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
    }

    // Picker, specialist, and summarizer all share the same LLM port but tag
    // distinct usage roles. Route by role: 'update.summary' for the summary
    // call, everything else (picker, specialist) to the main fake.
    function aRoutingLlm({mainReplies, summaryReplies}) {
        const main = aFakeLlm({replies: mainReplies})
        const summary = aFakeLlm({replies: summaryReplies})
        return {
            get summaryRequests() { return summary.receivedRequests },
            get mainRequests() { return main.receivedRequests },
            respondTo$(request) {
                return request.usageContext?.role === 'update.summary'
                    ? summary.respondTo$(request)
                    : main.respondTo$(request)
            }
        }
    }

    function aHarness({mainReplies, summaryReplies}) {
        const llm = aRoutingLlm({mainReplies, summaryReplies})
        const harness = aToolFactoryHarness({
            specialist: 'update_recipe',
            innerTools: updaterInnerTools(),
            llm
        })
        return {harness, llm}
    }

    // picker -> updater tool call -> updater empty -> summary fires
    const pickerThenUpdateThenEmpty = [
        {text: '{"handles":["datasets"]}'},
        {toolCalls: [updateCall]},
        {text: ''}
    ]

    it('uses the summarizer prose as the answer, not the deterministic fallback', () => {
        const {harness} = aHarness({
            mainReplies: pickerThenUpdateThenEmpty,
            summaryReplies: [{text: 'Updated the recipe to use Landsat only and tuned rendering.'}]
        })

        const result = harness.invoke({recipeId: 'r1', instruction: 'use only Landsat, speed up rendering'})

        expect(result).toEqual({ok: true, data: {answer: 'Updated the recipe to use Landsat only and tuned rendering.'}})
        expect(result.data.answer).not.toMatch(/Updated 1 handle/)
    })

    it('makes the summarizer call with no tools and reasoning disabled', () => {
        const {harness, llm} = aHarness({
            mainReplies: pickerThenUpdateThenEmpty,
            summaryReplies: [{text: 'Updated the recipe to use Landsat only.'}]
        })

        harness.invoke({recipeId: 'r1', instruction: 'use only Landsat'})

        expect(llm.summaryRequests).toHaveLength(1)
        expect(llm.summaryRequests[0].tools).toEqual([])
        expect(llm.summaryRequests[0].disableReasoning).toBe(true)
        expect(llm.summaryRequests[0].usageContext).toMatchObject({role: 'update.summary'})
    })

    it('feeds the summarizer the applied handles and the user request', () => {
        const {harness, llm} = aHarness({
            mainReplies: pickerThenUpdateThenEmpty,
            summaryReplies: [{text: 'Now Landsat only.'}]
        })

        harness.invoke({recipeId: 'r1', instruction: 'use only Landsat'})

        const summaryUserText = llm.summaryRequests[0].messages[1].content
        expect(summaryUserText).toContain('userRequest: use only Landsat')
        expect(summaryUserText).toContain('appliedHandles')
        expect(summaryUserText).toContain('datasets')
    })

    it('feeds the summarizer per-handle field metadata (label + valueLabels) so prose can avoid raw tokens', () => {
        const {harness, llm} = aHarness({
            mainReplies: pickerThenUpdateThenEmpty,
            summaryReplies: [{text: 'Switched to Landsat only.'}]
        })

        harness.invoke({recipeId: 'r1', instruction: 'use only Landsat'})

        const summaryUserText = llm.summaryRequests[0].messages[1].content
        expect(summaryUserText).toContain('appliedFields')
        expect(summaryUserText).toContain('"label":"Source datasets"')
        expect(summaryUserText).toContain('"LANDSAT":"Landsat"')
    })

    it('declares update.summary as the LLM usage role', () => {
        const {harness, llm} = aHarness({
            mainReplies: pickerThenUpdateThenEmpty,
            summaryReplies: [{text: 'ok'}]
        })

        harness.invoke({recipeId: 'r1', instruction: 'use only Landsat'})

        expect(llm.summaryRequests[0].usageContext).toMatchObject({role: 'update.summary'})
    })

    it('does not feed the summarizer raw invalidatedPaths — only handle-level invalidatedHandles', () => {
        // Inner-tool result carries invalidatedHandles, never invalidatedPaths.
        // Guard that no JSON Pointer leaks into the summary user message.
        const updateCallWithInvalidations = updateCall
        const successResult = {
            ok: true,
            data: {summary: 'Updated', modelHash: 'h-next', appliedHandles: ['datasets'], invalidatedHandles: ['cloudMethods']}
        }
        const innerTools = innerToolsImpl(
            {
                update_recipe_values: () => of(successResult),
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
        const llm = aRoutingLlm({
            mainReplies: [
                {text: '{"handles":["datasets"]}'},
                {toolCalls: [updateCallWithInvalidations]},
                {text: ''}
            ],
            summaryReplies: [{text: 'Now Landsat only.'}]
        })
        const harness = aToolFactoryHarness({specialist: 'update_recipe', innerTools, llm})

        harness.invoke({recipeId: 'r1', instruction: 'use only Landsat'})

        const summaryUserText = llm.summaryRequests[0].messages[1].content
        expect(summaryUserText).not.toMatch(/invalidatedPaths/)
        expect(summaryUserText).not.toMatch(/\/sources\//)
        expect(summaryUserText).not.toMatch(/\/compositeOptions\//)
        expect(summaryUserText).toMatch(/invalidatedHandles/)
        expect(summaryUserText).toContain('cloudMethods')
    })

    it('falls back to the deterministic generic answer when the summarizer is empty', () => {
        const {harness} = aHarness({
            mainReplies: pickerThenUpdateThenEmpty,
            summaryReplies: [{text: ''}]
        })

        const result = harness.invoke({recipeId: 'r1', instruction: 'use only Landsat'})

        expect(result).toEqual({ok: true, data: {answer: 'Updated 1 handle'}})
    })

    it('ends the loop on an empty response after a successful update — no stall-nudge round', () => {
        const {harness, llm} = aHarness({
            mainReplies: pickerThenUpdateThenEmpty,
            summaryReplies: [{text: 'Removed Sentinel-2.'}]
        })

        harness.invoke({recipeId: 'r1', instruction: 'use only Landsat'})

        expect(harness.bus.events.filter(event => event.type === 'specialist.stall')).toHaveLength(0)
        // picker + updater round 0 (tool call) + updater round 1 (empty / finish-on-empty)
        expect(llm.mainRequests).toHaveLength(3)
    })

    it('does not summarize when the specialist already produced a non-empty answer', () => {
        const {harness, llm} = aHarness({
            mainReplies: [
                {text: '{"handles":["datasets"]}'},
                {toolCalls: [updateCall]},
                {text: 'Removed Sentinel-2 from the sources.'}
            ],
            summaryReplies: [{text: 'should never be used'}]
        })

        const result = harness.invoke({recipeId: 'r1', instruction: 'use only Landsat'})

        expect(result).toEqual({ok: true, data: {answer: 'Removed Sentinel-2 from the sources.'}})
        expect(llm.summaryRequests).toHaveLength(0)
    })
})
