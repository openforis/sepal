import {aUserChatHarness, run} from '../../harness.js'

const SUB_A = {clientId: 'c1', subscriptionId: 's1'}
const SUB_B = {clientId: 'c2', subscriptionId: 's2'}

function runtimeContext(messages) {
    return messages.find(message => message.content?.includes('<runtime-context>'))?.content
}

describe('cross-subscription GUI context', () => {
    let harness
    beforeEach(() => {
        harness = aUserChatHarness({conversationIds: ['conv-1']})
        run(harness.handle$({type: 'create-conversation'}))
    })

    it('attaches only the sending subscription context to the LLM turn', () => {
        run(harness.handle$({type: 'context', ...SUB_A, guiContext: {section: 'process'}}))
        run(harness.handle$({type: 'context', ...SUB_B, guiContext: {section: 'browse'}}))

        run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'hello', ...SUB_A}))

        const turnContext = runtimeContext(harness.llm.receivedMessages[0])
        expect(turnContext).toContain('"section":"process"')
        expect(turnContext).not.toContain('browse')
    })

    it('attaches no runtime context when another subscription sends without one', () => {
        run(harness.handle$({type: 'context', ...SUB_A, guiContext: {section: 'process'}}))

        run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'hello', ...SUB_B}))

        expect(harness.llm.receivedMessages[0]).toEqual([{role: 'user', content: 'hello'}])
    })

    it('drops the cached context after clear-context', () => {
        run(harness.handle$({type: 'context', ...SUB_A, guiContext: {section: 'process'}}))
        run(harness.handle$({type: 'clear-context', ...SUB_A}))

        run(harness.handle$({type: 'message', conversationId: 'conv-1', text: 'hello', ...SUB_A}))

        expect(harness.llm.receivedMessages[0]).toEqual([{role: 'user', content: 'hello'}])
    })
})
