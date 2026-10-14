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

test('asks for and gives back its task\'s local processing slot through the gateway', async () => {
    const requests = []
    const endpoint = await new Promise(resolve => {
        server = http.createServer((req, res) => {
            requests.push(`${req.method} ${req.url}`)
            if (req.url.endsWith('/release')) {
                res.writeHead(204)
                res.end()
            } else {
                res.writeHead(200, {'Content-Type': 'application/json'})
                res.end('{"granted":true}')
            }
        }).listen(0, () => resolve(`http://localhost:${server.address().port}`))
    })
    const client = new SepalClient({endpoint, apiKey: API_KEY})

    expect(await client.requestLocalProcessing('t-1')).toEqual({granted: true})
    await client.releaseLocalProcessing('t-1')

    expect(requests).toEqual([
        'POST /api/tasks/task/t-1/local-processing',
        'POST /api/tasks/task/t-1/local-processing/release'
    ])
})

const serve = (status, body) => new Promise(resolve => {
    server = http.createServer((_req, res) => {
        res.writeHead(status, {'Content-Type': 'application/json'})
        res.end(body)
    }).listen(0, () => resolve(`http://localhost:${server.address().port}`))
})
