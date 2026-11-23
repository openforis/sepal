import assert from 'node:assert/strict'
import {describe, test} from 'node:test'

import {probeStartup} from '#sepal/testSupport/startup'

describe('user startup home mount', () => {
    test('refuses an unrestricted mount before database initialization', async () => {
        const result = await probeStartup(startup({options: 'rw,relatime'}))

        assert.equal(result.status, 1)
        assert.doesNotMatch(result.stdout, /STARTUP_DEPENDENCY_REACHED/)
        assert.match(result.stderr, /\/sepal\/home.*nosymfollow/)
    })

    test('starts initialization on the restricted mount', async () => {
        const result = await probeStartup(startup({options: 'rw,relatime,nosymfollow'}))

        assert.equal(result.status, 0, result.stderr)
        assert.match(result.stdout, /STARTUP_DEPENDENCY_REACHED/)
    })

    test('permits a normal mount only in the explicit DEV environment', async () => {
        const result = await probeStartup(startup({options: 'rw', environment: 'DEV'}))

        assert.equal(result.status, 0, result.stderr)
        assert.match(result.stdout, /STARTUP_DEPENDENCY_REACHED/)
    })

    test('does not treat a missing deployment environment as DEV', async () => {
        const result = await probeStartup({...startup({options: 'rw'}), environment: undefined})

        assert.equal(result.status, 1)
        assert.doesNotMatch(result.stdout, /STARTUP_DEPENDENCY_REACHED/)
        assert.match(result.stderr, /nosymfollow/)
    })

    test('refuses to initialize when mountinfo cannot be read', async () => {
        const result = await probeStartup({...startup({options: 'rw'}), mountInfoError: 'Cannot read /proc/self/mountinfo'})

        assert.equal(result.status, 1)
        assert.doesNotMatch(result.stdout, /STARTUP_DEPENDENCY_REACHED/)
        assert.match(result.stderr, /Cannot read \/proc\/self\/mountinfo/)
    })

    test('DEV does not require Linux mountinfo', async () => {
        const result = await probeStartup({
            ...startup({options: 'rw', environment: 'DEV'}), mountInfoError: 'Cannot read /proc/self/mountinfo'
        })

        assert.equal(result.status, 0, result.stderr)
        assert.match(result.stdout, /STARTUP_DEPENDENCY_REACHED/)
    })
})

const startup = ({options, environment = 'PROD'}) => ({
    main: new URL('./main.js', import.meta.url),
    boundary: {module: new URL('./db.js', import.meta.url).href, export: 'initializeDb'},
    homeDir: '/sepal/home',
    environment,
    mountInfo: `10 1 0:1 / / rw - tmpfs tmpfs rw\n11 10 0:2 / /sepal/home ${options} - tmpfs tmpfs rw\n`
})
