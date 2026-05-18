const {finalize} = require('rxjs')
const {truncateTo} = require('../debugText')

const MAX_LOG_TEXT = 300

function publishResponseSummary({bus, model, acc, debugLabel}) {
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
            `text=${JSON.stringify(truncateTo(acc.text, MAX_LOG_TEXT))}`
        ].join(' ')
    }))
}

module.exports = {publishResponseSummary}
