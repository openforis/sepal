const {finalize} = require('rxjs')
const {truncateString, createDiagnostics} = require('../diagnostics')

const MAX_LOG_TEXT = 300
const DEFAULT_DIAGNOSTICS = createDiagnostics()

function publishResponseSummary({bus, model, acc, debugLabel, diagnostics = DEFAULT_DIAGNOSTICS}) {
    return finalize(() => bus.publish({
        type: 'llm.response',
        level: 'debug',
        message: () => [
            `LLM response${debugLabel ? ` (${debugLabel})` : ''}: model=${model}`,
            `chunks=${acc.chunkCount}`,
            `contentChunks=${acc.contentChunkCount ?? '-'}`,
            `toolCallChunks=${acc.toolCallChunkCount ?? '-'}`,
            `toolCalls=${acc.toolCalls?.size ?? '-'}`,
            `finishReasons=[${[...(acc.finishReasons || [])].join(',') || '-'}]`,
            `deltaKeys=[${[...(acc.deltaKeys || [])].join(',') || '-'}]`,
            `text=${JSON.stringify(responseText(acc.text, diagnostics))}`
        ].join(' ')
    }))
}

function responseText(text, diagnostics) {
    if (diagnostics.fullPayloads) return truncateString(text)
    return truncateString(text, MAX_LOG_TEXT)
}

module.exports = {publishResponseSummary}
