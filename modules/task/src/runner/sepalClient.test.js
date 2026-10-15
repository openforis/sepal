import http from 'node:http'

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

test('asks for its task\'s local processing slot and gives back the grant it names, through the gateway', async () => {
    const {endpoint, requests} = await recording(req => req.url.endsWith('/release')
        ? [204]
        : [200, '{"granted":true,"slot":"2026-10-15T08:00:00.000Z"}'])
    const client = new SepalClient({endpoint, apiKey: API_KEY})

    const {slot} = await client.requestLocalProcessing('t-1')
    await client.releaseLocalProcessing('t-1', slot)

    expect(requests).toEqual([
        {url: '/api/tasks/task/t-1/local-processing', body: {}},
        {url: '/api/tasks/task/t-1/local-processing/release', body: {slot: '2026-10-15T08:00:00.000Z'}}
    ])
})

test('reports progress with the slot it last gave back', async () => {
    const {endpoint, requests} = await recording(() => [204])
    const client = new SepalClient({endpoint, apiKey: API_KEY})

    await client.reportProgress('t-1', {messageKey: 'k'}, '2026-10-15T08:00:00.000Z')

    expect(requests).toEqual([
        {url: '/api/tasks/task/t-1/progress', body: {statusDescription: {messageKey: 'k'}, releasedSlot: '2026-10-15T08:00:00.000Z'}}
    ])
})

const serve = (status, body) => new Promise(resolve => {
    server = http.createServer((_req, res) => {
        res.writeHead(status, {'Content-Type': 'application/json'})
        res.end(body)
    }).listen(0, () => resolve(`http://localhost:${server.address().port}`))
})

const recording = answer => new Promise(resolve => {
    const requests = []
    server = http.createServer((req, res) => {
        let body = ''
        req.on('data', chunk => body += chunk)
        req.on('end', () => {
            requests.push({url: req.url, body: JSON.parse(body)})
            const [status, responseBody] = answer(req)
            res.writeHead(status, responseBody ? {'Content-Type': 'application/json'} : {})
            res.end(responseBody)
        })
    }).listen(0, () => resolve({endpoint: `http://localhost:${server.address().port}`, requests}))
})
