import {jest} from '@jest/globals'

import {conversationWithToolRoundTrip, toolSchemas} from '../providerConformance.js'

const mockCreate = jest.fn()

jest.unstable_mockModule('openai', () => ({
    default: jest.fn().mockImplementation(() => ({
        chat: {completions: {create: mockCreate}}
    }))
}))

const {anOpenAiChat, collect} = await import('./openaiAdapterHarness.js')

describe('OpenAI adapter — wire mapping (input → provider request)', () => {

    beforeEach(() => mockCreate.mockReset())

    function whenCalledWith({provider, ...request} = {}) {
        mockCreate.mockResolvedValue([{choices: [{delta: {content: 'ok'}}]}])
        const chat = anOpenAiChat(provider ? {provider} : {})
        return collect(chat.respondTo$(request))
    }

    function wireCall() {
        return mockCreate.mock.calls[0][0]
    }

    function lastAssistantOnWire() {
        return wireCall().messages.find(message => message.role === 'assistant')
    }

    describe('request params', () => {

        it('forwards maxTokens, temperature, and extraParams to the provider', async () => {
            await whenCalledWith({
                messages: [{role: 'user', content: 'hi'}],
                maxTokens: 32, temperature: 0,
                extraParams: {chat_template_kwargs: {enable_thinking: false}}
            })

            expect(wireCall()).toMatchObject({
                max_tokens: 32, temperature: 0,
                chat_template_kwargs: {enable_thinking: false}
            })
        })

        it('asks for token usage in the stream so usage can be exact', async () => {
            await whenCalledWith({messages: [{role: 'user', content: 'hi'}]})

            expect(wireCall().stream_options).toEqual({include_usage: true})
        })

        it('defaults max_tokens to 4096 (so LM Studio defaults do not silently length-cap normal calls)', async () => {
            await whenCalledWith({messages: [{role: 'user', content: 'hi'}]})

            expect(wireCall().max_tokens).toBe(4096)
        })

        it('omits tools + tool_choice when no tools are provided', async () => {
            await whenCalledWith({messages: [{role: 'user', content: 'hi'}]})

            expect(wireCall()).not.toHaveProperty('tools')
            expect(wireCall()).not.toHaveProperty('tool_choice')
        })

        it('sends tool schemas in OpenAI function shape with tool_choice=auto', async () => {
            await whenCalledWith({messages: [{role: 'user', content: 'hi'}], tools: toolSchemas})

            expect(wireCall()).toMatchObject({
                tools: [{type: 'function', function: {name: 'echo', parameters: toolSchemas[0].parameters}}],
                tool_choice: 'auto'
            })
        })
    })

    describe('message translation', () => {

        it('expands internal tool-call + tool-result turns into provider-shaped tool_calls + role:tool messages', async () => {
            await whenCalledWith({messages: conversationWithToolRoundTrip})

            expect(wireCall().messages).toEqual([
                {role: 'user', content: 'list'},
                {role: 'assistant', content: null, tool_calls: [
                    {id: 'call_1', type: 'function', function: {name: 'echo', arguments: '{"text":"hi"}'}}
                ]},
                {role: 'tool', tool_call_id: 'call_1', content: '{"toolName":"echo","ok":true,"data":{"echoed":"hi"}}'},
                {role: 'tool', tool_call_id: 'call_2', content: '{"toolName":"echo","ok":false,"error":{"code":"TOOL_FAILED"}}'}
            ])
        })

        it('coerces whitespace-only content on a tool-call assistant to null (OpenAI wants null or substantive)', async () => {
            await whenCalledWith({messages: [
                {role: 'user', content: 'list'},
                {role: 'assistant', content: '\n\n', toolCalls: [{id: 'c1', name: 'echo', input: {text: 'hi'}}]}
            ]})

            expect(lastAssistantOnWire().content).toBeNull()
        })

        it('strips GUI display descriptors from assistant messages', async () => {
            await whenCalledWith({messages: [
                {role: 'user', content: 'q'},
                {role: 'assistant', content: 'Step cap reached.',
                    display: {key: 'home.chat.notices.toolRoundCap', args: {max: 8}, fallback: 'x'}}
            ]})

            expect(lastAssistantOnWire()).toEqual({role: 'assistant', content: 'Step cap reached.'})
        })
    })

    describe('reasoning_content gating', () => {

        it('forwards reasoning as reasoning_content on a tool-call assistant for LM Studio', async () => {
            await whenCalledWith({
                provider: 'lmstudio',
                messages: [
                    {role: 'user', content: 'list'},
                    {role: 'assistant', content: '',
                        toolCalls: [{id: 'c1', name: 'echo', input: {text: 'hi'}}],
                        reasoning: 'plan to echo'},
                    {role: 'tool', toolResults: [{toolCallId: 'c1', toolName: 'echo', result: {ok: true, data: {}}}]}
                ]
            })

            expect(lastAssistantOnWire().reasoning_content).toBe('plan to echo')
        })

        it('forwards reasoning on a text-only assistant for LM Studio', async () => {
            await whenCalledWith({
                provider: 'lmstudio',
                messages: [{role: 'user', content: 'q'}, {role: 'assistant', content: 'A.', reasoning: 'why'}]
            })

            expect(lastAssistantOnWire().reasoning_content).toBe('why')
        })

        it('omits reasoning_content when no reasoning was attached', async () => {
            await whenCalledWith({
                provider: 'lmstudio',
                messages: [{role: 'user', content: 'q'}, {role: 'assistant', content: 'A.'}]
            })

            expect(lastAssistantOnWire()).not.toHaveProperty('reasoning_content')
        })

        it('does NOT forward reasoning_content for non-LM-Studio providers (Qwen-only extension)', async () => {
            await whenCalledWith({
                messages: [{role: 'user', content: 'q'}, {role: 'assistant', content: 'A.', reasoning: 'why'}]
            })

            expect(lastAssistantOnWire()).not.toHaveProperty('reasoning_content')
        })

        it('does NOT forward reasoning_content on tool-call turns for non-LM-Studio providers either', async () => {
            await whenCalledWith({messages: [
                {role: 'user', content: 'list'},
                {role: 'assistant', content: '',
                    toolCalls: [{id: 'c1', name: 'echo', input: {text: 'hi'}}], reasoning: 'plan'},
                {role: 'tool', toolResults: [{toolCallId: 'c1', toolName: 'echo', result: {ok: true, data: {}}}]}
            ]})

            expect(lastAssistantOnWire()).not.toHaveProperty('reasoning_content')
        })
    })

    describe('reasoning-only assistant messages', () => {

        it('drops the message when reasoning_content cannot ride — avoids a blank assistant on the wire', async () => {
            await whenCalledWith({messages: [
                {role: 'user', content: 'q'},
                {role: 'assistant', content: '', reasoning: 'silent thinking'},
                {role: 'user', content: 'still there?'}
            ]})

            expect(wireCall().messages.map(message => message.role)).toEqual(['user', 'user'])
        })

        it('keeps the message as a reasoning_content carrier on LM Studio', async () => {
            await whenCalledWith({
                provider: 'lmstudio',
                messages: [
                    {role: 'user', content: 'q'},
                    {role: 'assistant', content: '', reasoning: 'rides through'},
                    {role: 'user', content: 'still there?'}
                ]
            })

            expect(lastAssistantOnWire()).toEqual({role: 'assistant', content: '', reasoning_content: 'rides through'})
        })
    })
})
