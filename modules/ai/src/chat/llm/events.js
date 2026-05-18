const {finalize} = require('rxjs')
const {truncateTo} = require('../debugText')

const MAX_LOG_TEXT = 300

function publishResponseSummary({bus, model, acc}) {
    return finalize(() => bus.publish({
        type: 'llm.response',
        level: 'debug',
        message: () => `LLM response: model=${model} chunks=${acc.chunkCount} text=${JSON.stringify(truncateTo(acc.text, MAX_LOG_TEXT))}`
    }))
}

module.exports = {publishResponseSummary}
