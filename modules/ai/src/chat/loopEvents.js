// Shared event publishers for the orchestrator and specialist LLM loops.
// The two loops diverge substantially elsewhere; the per-round prompt
// snapshot event is one of the few places they're structurally identical.

import {renderPromptSnapshot} from './promptSnapshot.js'

// Publishes a trace-level prompt-snapshot event with a lazy message.
// `prefix` becomes the event-type root (logListener routes by first dot
// segment, so 'orchestrator' → orchestrator category, 'specialist' →
// specialist category). `name` is omitted from the event and from the
// rendered message when not supplied.
function publishLoopPrompt({bus, prefix, name, conversationId, round, messages, toolSchemas}) {
    const event = {
        type: `${prefix}.prompt`,
        level: 'trace',
        conversationId,
        round,
        messageCount: messages.length,
        toolNames: toolSchemas.map(schema => schema.name),
        message: () => `${prefix}.prompt${name ? ` name=${name}` : ''} conversationId=${conversationId} round=${round}\n${renderPromptSnapshot({messages, tools: toolSchemas})}`
    }
    if (name) event.name = name
    bus.publish(event)
}

export {publishLoopPrompt}
