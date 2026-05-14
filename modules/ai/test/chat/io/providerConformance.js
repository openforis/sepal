// Provider-neutral internal fixtures shared by provider adapter tests
// (openai.test.js now, claude.test.js later). Each adapter feeds these through
// its own respondTo$ and asserts its provider-specific wire conversion. The
// internal shape — {role, content, toolCalls}, {id, name, input},
// {toolCallId, toolName, result: {ok, data?, error?}} — is the contract every
// adapter must consume.

const toolSchemas = [{
    name: 'echo',
    description: 'Echo input text.',
    parameters: {type: 'object', properties: {text: {type: 'string'}}, required: ['text']}
}]

const conversationWithToolRoundTrip = [
    {role: 'user', content: 'list'},
    {role: 'assistant', content: '', toolCalls: [{id: 'call_1', name: 'echo', input: {text: 'hi'}}]},
    {role: 'tool', toolResults: [
        {toolCallId: 'call_1', toolName: 'echo', result: {ok: true, data: {echoed: 'hi'}}},
        {toolCallId: 'call_2', toolName: 'echo', result: {ok: false, error: {code: 'TOOL_FAILED'}}}
    ]}
]

module.exports = {toolSchemas, conversationWithToolRoundTrip}
