const {firstValueFrom, toArray} = require('rxjs')
const {createOpenAI} = require('#mcp/chat/io/openai')

const BASE_URL = process.env.LLM_BASE_URL ?? 'http://host.docker.internal:1234/v1'
const API_KEY = process.env.LLM_API_KEY ?? 'lm-studio'
const MODEL = process.env.LLM_MODEL

describe('OpenAI-compatible adapter [manual]', () => {

    it('streams text deltas from a real LLM', async () => {
        if (!MODEL) {
            throw new Error('Set LLM_MODEL to the model identifier loaded in LM Studio (e.g. LLM_MODEL=meta-llama-3-8b-instruct)')
        }

        const openai = createOpenAI({
            baseURL: BASE_URL, apiKey: API_KEY, model: MODEL,
            bus: {publish: () => {}}
        })

        const events = await firstValueFrom(
            openai.respondTo$({
                messages: [{role: 'user', content: 'Say hello in one word.'}]
            }).pipe(toArray())
        )

        expect(events.length).toBeGreaterThan(0)
        expect(events[0]).toHaveProperty('textDelta')
    }, 60000)
})
