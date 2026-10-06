import http from 'http'

import {SepalClient} from './sepalClient.js'

const API_KEY = 'task_secretkey123'

let server

afterEach(() => new Promise(resolve => server ? server.close(resolve) : resolve()))

test('a failed request keeps its status and body but not the task key', async () => {
    const endpoint = await serve(500, '{"error":"boom"}')
    const client = new SepalClient({endpoint, apiKey: API_KEY})

    const error = await client.startExport('export', {a: 1}).catch(e => e)

    expect(error.statusCode).toBe(500)
    expect(error.body).toBe('{"error":"boom"}')
    expect(error.request).toBeUndefined()
    const logged = JSON.stringify(error, Object.getOwnPropertyNames(error))
    const basic = Buffer.from(`:${API_KEY}`).toString('base64')
    expect(logged).not.toContain(API_KEY)
    expect(logged).not.toContain(basic)
})

const serve = (status, body) => new Promise(resolve => {
    server = http.createServer((_req, res) => {
        res.writeHead(status, {'Content-Type': 'application/json'})
        res.end(body)
    }).listen(0, () => resolve(`http://localhost:${server.address().port}`))
})
