const {throwError} = require('rxjs')
const {aConversationHarness, collect} = require('../../harness')

const recipeListSchema = {
    name: 'recipe_list',
    description: 'List recipes.',
    parameters: {type: 'object', properties: {}, additionalProperties: true}
}

describe('tool errors', () => {

    describe('when a tool throws on first invocation', () => {
        const toolCall = {id: 't1', name: 'recipe_list', input: {}}
        const failingTool = {
            ...recipeListSchema,
            invoke$: () => throwError(() => new Error('database unreachable'))
        }

        let harness
        beforeEach(() => {
            harness = aConversationHarness({
                replies: [
                    {toolCalls: [toolCall]},
                    {text: 'Sorry, I could not list your recipes.'}
                ],
                tools: [failingTool]
            })
        })

        it('feeds a TOOL_FAILED envelope back to the LLM and still streams the assistant answer', async () => {
            const events = await collect(harness.send$('list my recipes'))

            const toolMessage = harness.llm.receivedMessages[1].find(m => m.role === 'tool')
            expect(toolMessage.toolResults[0].result).toEqual({
                ok: false,
                error: {code: 'TOOL_FAILED', message: 'database unreachable'}
            })
            expect(events).toContainEqual({textDelta: 'Sorry, I could not list your recipes.'})
        })

        it('emits a tool-end event carrying the failure code on the channel', async () => {
            const events = await collect(harness.send$('list my recipes'))

            expect(events).toContainEqual({
                toolEnd: {
                    toolCallId: toolCall.id,
                    toolName: toolCall.name,
                    ok: false,
                    data: undefined,
                    error: {code: 'TOOL_FAILED', message: 'database unreachable'}
                }
            })
        })
    })

    describe('when the LLM repeats an identical failing tool call', () => {
        const failingCall = {id: 't1', name: 'recipe_list', input: {filter: 'mine'}}
        const repeatCall = {id: 't2', name: 'recipe_list', input: {filter: 'mine'}}

        function harnessRepeating({tailReply}) {
            return aConversationHarness({
                replies: [
                    {toolCalls: [failingCall]},
                    {toolCalls: [repeatCall]},
                    tailReply
                ],
                tools: [{
                    ...recipeListSchema,
                    invoke$: () => throwError(() => new Error('boom'))
                }]
            })
        }

        it('short-circuits the repeat with TOOL_REPEAT_BLOCKED without re-invoking the tool', async () => {
            const harness = harnessRepeating({tailReply: {text: 'Giving up.'}})

            await collect(harness.send$('list my recipes'))

            expect(harness.invocations).toEqual([failingCall])
            expect(harness.llm.receivedMessages[2]).toContainEqual({
                role: 'tool',
                toolResults: [{
                    toolCallId: repeatCall.id,
                    toolName: repeatCall.name,
                    result: {ok: false, error: {code: 'TOOL_REPEAT_BLOCKED', message: expect.stringMatching(/repeat/i)}}
                }]
            })
        })

        it('does not let a blocked repeat count toward the consecutive-failure bail', async () => {
            const harness = aConversationHarness({
                replies: [
                    {toolCalls: [failingCall]},
                    {toolCalls: [repeatCall]},
                    {toolCalls: [{...failingCall, id: 't3'}]},
                    {text: 'Done complaining.'}
                ],
                tools: [{
                    ...recipeListSchema,
                    invoke$: () => throwError(() => new Error('boom'))
                }]
            })

            const events = await collect(harness.send$('list my recipes'))

            expect(events.find(event => event.notice)).toBeUndefined()
            expect(events).toContainEqual({textDelta: 'Done complaining.'})
        })
    })
})
