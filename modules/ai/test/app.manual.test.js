import {createApp} from '#mcp/app'

const PORT = 8080
const BASE_URL = process.env.LLM_BASE_URL ?? 'http://host.docker.internal:1234/v1'
const API_KEY = process.env.LLM_API_KEY ?? 'lm-studio'
const MODEL = process.env.LLM_MODEL

describe('App smoke test [manual]', () => {

    it('creates a conversation and streams an LLM reply over WebSocket', async () => {
        if (!MODEL) {
            throw new Error('Set LLM_MODEL to the model identifier loaded in LM Studio (e.g. LLM_MODEL=meta-llama-3-8b-instruct)')
        }

        const app = createApp({
            config: {
                port: PORT,
                llmBaseUrl: BASE_URL,
                llmApiKey: API_KEY,
                llmModel: MODEL
            }
        })
        await app.start()

        const ws = new WebSocket(`ws://localhost:${PORT}/ws`)
        await whenOpen(ws)

        const received = []
        ws.addEventListener('message', event => received.push(JSON.parse(event.data)))

        const subscription = {user: {username: 'smoke'}, clientId: 'smoke-client', subscriptionId: 'smoke-sub'}

        ws.send(JSON.stringify({event: 'subscriptionUp', ...subscription}))
        ws.send(JSON.stringify({data: {type: 'create-conversation'}, ...subscription}))

        await waitFor(() => received.some(m => m.data?.type === 'conversation-created'), 5000)

        const created = received.find(m => m.data?.type === 'conversation-created')
        const conversationId = created?.data?.conversationId
        ws.send(JSON.stringify({data: {type: 'message', conversationId, text: 'Say hello in one word.'}, ...subscription}))

        await waitFor(
            () => received.some(m => m.data?.type === 'chat-response' && m.data?.complete),
            60000
        )

        ws.close()

        expect(conversationId).toBeTruthy()

        const responses = received.filter(m => m.data?.type === 'chat-response')
        const textChunks = responses.filter(m => m.data.text != null).map(m => m.data.text)
        expect(textChunks.length).toBeGreaterThan(0)
    }, 90000)
})

function whenOpen(ws) {
    return new Promise((resolve, reject) => {
        ws.addEventListener('open', () => resolve(), {once: true})
        ws.addEventListener('error', err => reject(err), {once: true})
    })
}

function waitFor(condition, timeoutMs) {
    const startedAt = Date.now()
    return new Promise((resolve, reject) => {
        const check = () => {
            if (condition()) return resolve()
            if (Date.now() - startedAt > timeoutMs) return reject(new Error('Timeout waiting for condition'))
            setTimeout(check, 50)
        }
        check()
    })
}
