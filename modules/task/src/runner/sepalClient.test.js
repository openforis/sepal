import http from 'node:http'

import {SepalClient} from './sepalClient.js'

const API_KEY = 'task_secretkey123'

let server
let requests

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

test('dataAccess posts the task purpose with the task key and returns the body', async () => {
    const endpoint = await serve(200, '{"attachment":"data","mode":"read"}')
    const client = new SepalClient({endpoint, apiKey: API_KEY})

    const access = await client.dataAccess()

    expect(access).toEqual({attachment: 'data', mode: 'read'})
    expect(requests[0].url).toBe('/api/user-data/attachments/data/access')
    expect(JSON.parse(requests[0].body)).toEqual({purpose: 'task'})
    expect(requests[0].authorization).toBe(`Basic ${Buffer.from(`:${API_KEY}`).toString('base64')}`)
})

test('dataChanged posts to the changed endpoint', async () => {
    const endpoint = await serve(204, '')
    const client = new SepalClient({endpoint, apiKey: API_KEY})

    await client.dataChanged()

    expect(requests[0].method).toBe('POST')
    expect(requests[0].url).toBe('/api/user-data/attachments/data/changed')
})

const serve = (status, body) => new Promise(resolve => {
    requests = []
    server = http.createServer((req, res) => {
        const chunks = []
        req.on('data', chunk => chunks.push(chunk))
        req.on('end', () => {
            requests.push({method: req.method, url: req.url, authorization: req.headers.authorization, body: Buffer.concat(chunks).toString()})
            res.writeHead(status, {'Content-Type': 'application/json'})
            res.end(body)
        })
    }).listen(0, () => resolve(`http://localhost:${server.address().port}`))
})
