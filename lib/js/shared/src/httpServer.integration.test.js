import assert from 'node:assert/strict'
import {afterEach, describe, it} from 'node:test'

import {WebSocket} from 'ws'

import {start} from '#sepal/httpServer'

const TEST_ROUTE = '/test/http/direct/0/0/0'
// Each start would otherwise register the default Prometheus metrics again.
const metricsMiddleware = (_ctx, next) => next()

describe('httpServer test routes', () => {
    let server
    const deployEnvironment = process.env.DEPLOY_ENVIRONMENT

    afterEach(() => {
        server?.close()
        if (deployEnvironment === undefined) {
            delete process.env.DEPLOY_ENVIRONMENT
        } else {
            process.env.DEPLOY_ENVIRONMENT = deployEnvironment
        }
    })

    it('are not served outside the dev environment', async () => {
        process.env.DEPLOY_ENVIRONMENT = 'PROD'
        server = await start({port: 0, metricsMiddleware})

        const response = await fetch(`http://localhost:${server.address().port}${TEST_ROUTE}`)

        assert.equal(response.status, 404)
    })

    it('are served in the dev environment', async () => {
        process.env.DEPLOY_ENVIRONMENT = 'DEV'
        server = await start({port: 0, metricsMiddleware})

        const response = await fetch(`http://localhost:${server.address().port}${TEST_ROUTE}`)

        assert.notEqual(response.status, 404)
    })
})

describe('httpServer websocket routes', () => {
    let server

    afterEach(() => server?.close())

    it('answer an upgrade to a path without a handler with 404', async () => {
        server = await start({port: 0, metricsMiddleware, wsRoutes: {'/ws': ws => ws.close()}})

        const status = await new Promise((resolve, reject) => {
            const ws = new WebSocket(`ws://localhost:${server.address().port}/metrics`)
            ws.on('open', () => reject(new Error('Upgraded')))
            ws.on('unexpected-response', (_req, res) => resolve(res.statusCode))
            ws.on('error', reject)
        })

        assert.equal(status, 404)
    })
})
