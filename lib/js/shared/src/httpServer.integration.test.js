import assert from 'node:assert/strict'
import {afterEach, describe, it} from 'node:test'

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
