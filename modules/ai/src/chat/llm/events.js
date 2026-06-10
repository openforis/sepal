import {finalize} from 'rxjs'

import {createDiagnostics, shortHashOf, truncateString} from '../diagnostics.js'

const MAX_LOG_TEXT = 300
const DEFAULT_DIAGNOSTICS = createDiagnostics()

// Counts-only summary at debug level. Per-content text + reasoning samples
// move to `llm.responsePayload` at trace level — full text (and especially
// reasoning content) is sensitive enough that it shouldn't ride at debug.
// Hashes here let two log lines be correlated across event types without
// re-emitting the content.
function publishResponseSummary({bus, model, acc, debugLabel, attempt = 0, diagnostics = DEFAULT_DIAGNOSTICS}) {
    return finalize(() => {
        const contentHash = shortHashOf(acc.text)
        const reasoningHash = acc.reasoningChunkCount ? shortHashOf(acc.reasoning) : null
        bus.publish({
            type: 'llm.response',
            level: 'debug',
            attempt,
            message: () => [
                `LLM response${debugLabel ? ` (${debugLabel})` : ''}: model=${model}`,
                `attempt=${attempt}`,
                `chunks=${acc.chunkCount}`,
                `contentChunks=${acc.contentChunkCount ?? '-'}`,
                `reasoningChunks=${acc.reasoningChunkCount ?? '-'}`,
                `toolCallChunks=${acc.toolCallChunkCount ?? '-'}`,
                `toolCalls=${acc.toolCalls?.size ?? '-'}`,
                `finishReasons=[${[...(acc.finishReasons || [])].join(',') || '-'}]`,
                `deltaKeys=[${[...(acc.deltaKeys || [])].join(',') || '-'}]`,
                `textBytes=${byteLengthOf(acc.text)}`,
                `textHash=${contentHash}`,
                ...(reasoningHash ? [`reasoningBytes=${byteLengthOf(acc.reasoning)}`, `reasoningHash=${reasoningHash}`] : [])
            ].join(' ')
        })
        bus.publish({
            type: 'llm.responsePayload',
            level: 'trace',
            attempt,
            message: () => [
                `LLM response payload${debugLabel ? ` (${debugLabel})` : ''}: attempt=${attempt}`,
                `textHash=${contentHash}`,
                `text=${JSON.stringify(responseText(acc.text, diagnostics))}`,
                ...(reasoningHash ? [`reasoningHash=${reasoningHash}`, `reasoning=${JSON.stringify(responseText(acc.reasoning, diagnostics))}`] : [])
            ].join(' ')
        })
    })
}

function responseText(text, diagnostics) {
    if (diagnostics.fullPayloads) return truncateString(text)
    return truncateString(text, MAX_LOG_TEXT)
}

function byteLengthOf(text) {
    return typeof text === 'string' ? Buffer.byteLength(text, 'utf8') : 0
}

export {publishResponseSummary}
