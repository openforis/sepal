const {defer, from, filter, finalize, map, mergeMap, tap} = require('rxjs')
const OpenAI = require('openai').default

const MAX_LOG_TEXT = 300

function createOpenAI({baseURL, apiKey, model, bus}) {
    const client = new OpenAI({baseURL, apiKey})

    return {respondTo$}

    function respondTo$({messages}) {
        const acc = {text: '', chunkCount: 0}
        return defer(() => from(client.chat.completions.create({model, messages, stream: true}))).pipe(
            mergeMap(stream => from(stream)),
            tap(chunk => {
                acc.chunkCount++
                bus.publish({
                    type: 'llm.chunk',
                    level: 'trace',
                    message: `LLM chunk ${acc.chunkCount}: ${JSON.stringify(chunk)}`
                })
                const delta = chunk.choices?.[0]?.delta?.content
                if (delta) acc.text += delta
            }),
            map(chunk => chunk.choices?.[0]?.delta?.content),
            filter(Boolean),
            map(textDelta => ({textDelta})),
            finalize(() => {
                bus.publish({
                    type: 'llm.response',
                    level: 'debug',
                    message: `LLM response: model=${model} chunks=${acc.chunkCount} text=${JSON.stringify(truncate(acc.text))}`
                })
            })
        )
    }
}

function truncate(text) {
    if (text.length <= MAX_LOG_TEXT) return text
    return `${text.slice(0, MAX_LOG_TEXT)}…`
}

module.exports = {createOpenAI}
