// A session persists only the {id, host} projection of its instance. Everything else the
// provisioner needs — the type, and the reservation the container name derives from — has to be
// rebuilt from the session's own columns. One helper, because three callers rebuild it:
// sessionsWithoutInstance, reprovisionInstance, and main.js's restore reader.

import assert from 'node:assert/strict'
import {test} from 'node:test'

import {instanceFromSession} from './instanceFromSession.js'

const session = (overrides = {}) => ({
    id: 's-1',
    username: 'alice',
    workerType: 'sandbox',
    instanceType: 'T3aSmall',
    instance: {id: 'i-1', host: '10.0.0.1'},
    creationTime: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
})

test('rebuilds the reservation the container name derives from', () => {
    assert.deepEqual(instanceFromSession(session()).reservation, {
        username: 'alice',
        workerType: 'sandbox',
        sessionId: 's-1',
    })
})

test('carries the type and host the provisioner addresses', () => {
    const instance = instanceFromSession(session())
    assert.equal(instance.id, 'i-1')
    assert.equal(instance.type, 'T3aSmall')
    assert.equal(instance.host, '10.0.0.1')
    assert.equal(instance.running, true)
})

// releaseUnusedInstances ages instances against launchTime and sizeIdlePool sorts by it, so a
// rebuilt instance that defaulted to "now" would look permanently too young to release.
test('ages from the session creation time, not from now', () => {
    assert.deepEqual(
        instanceFromSession(session()).launchTime,
        new Date('2026-01-01T00:00:00Z')
    )
})
