import {firstValueFrom, toArray} from 'rxjs'

import {createOpenAiChatCompletions} from '#mcp/chat/llm/providers/openaiChatCompletions'

function anOpenAiChat(overrides = {}) {
    return createOpenAiChatCompletions({
        baseURL: 'http://example.test/v1',
        apiKey: 'test-key',
        model: 'test-model',
        bus: {publish: () => {}},
        clock: {now: () => 0},
        ...overrides
    })
}

function collect(response$) {
    return firstValueFrom(response$.pipe(toArray()))
}

function contentEvents(events) {
    return events.filter(event => 'textDelta' in event || 'toolCall' in event)
}

export {anOpenAiChat, collect, contentEvents}
