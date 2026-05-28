const {createDescribeWorkflow} = require('#mcp/chat/specialists/describeRecipe/describeWorkflow')
const {aRecordingBus, aFakeLlm, aFakeGuiRequests} = require('../../harness')
const {read} = require('../../builders')

describe('describe_recipe workflow', () => {

    describe('happy path', () => {

        it('runs picker then a single answerer LLM call and returns the answerer text', () => {
            const run = aDescribeWorkflow()
                .picksHandles('dates')
                .answersWith('Targets 2024-07-02.')
                .runIt('what date is this set to?')

            expect(run.result).toEqual({ok: true, data: {answer: 'Targets 2024-07-02.'}})
            expect(run.llmCallCount).toBe(2)
        })
    })
})

function aDescribeWorkflow() {
    let pickedHandles = []
    let answerText = ''
    return {
        picksHandles(...handles) { pickedHandles = handles; return this },
        answersWith(text) { answerText = text; return this },
        runIt(question) {
            const bus = aRecordingBus()
            const guiRequests = aFakeGuiRequests()
            const llm = aFakeLlm({replies: [
                {text: JSON.stringify({handles: pickedHandles})},
                {text: answerText}
            ]})
            const workflow = createDescribeWorkflow({llm, bus, guiRequests})
            const result = read(workflow.run$({
                recipeId: 'r1', question,
                context: {conversationId: 'c1'}
            }))
            return {
                result,
                llmCallCount: llm.receivedMessages.length,
                bus
            }
        }
    }
}
