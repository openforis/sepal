import assert from 'node:assert/strict'
import {test} from 'node:test'

import {probeStartup} from './startup.js'

test('reports a signaled startup child as failed even after initialization was reached', async () => {
    const result = await probeStartup({
        main: new URL('./fixtures/startupSignal.js', import.meta.url),
        boundary: {module: '#sepal/messageQueue', export: 'initMessageQueue'},
        homeDir: '/unused',
        environment: 'DEV'
    })

    assert.match(result.stdout, /STARTUP_DEPENDENCY_REACHED/)
    assert.notEqual(result.status, 0)
})
