// Unit tests for the single container-name formula.
//
// The formula used to be written out at three call sites (create, start-server, stats). They must
// agree exactly or the container simply cannot be found, so it lives here once and they all call it.

import {containerName} from './containerName.js'
import {instanceName} from './instanceName.js'

describe('containerName', () => {
    const sessionId = '25a02f1c-9e59-491e-b5ac-80b95dcc274e'
    const instanceId = 'i-0abc123'

    test('is the image, the username, the session\'s two-word name and the instance id', () => {
        expect(containerName({image: 'sandbox', username: 'alice', sessionId, instanceId}))
            .toBe(`sandbox.alice.${instanceName(sessionId)}.i-0abc123`)
    })

    // The container carries the name the user already reads for the instance, rather than only
    // an identifier the daemon knows.
    test('carries the name the user reads for that instance', () => {
        const name = containerName({image: 'sandbox', username: 'alice', sessionId, instanceId})
        expect(name).toContain(`.${instanceName(sessionId)}.`)
    })

    // Both shared-daemon ownership lookups (the pre-create cleanup and the orphan sweep) decide
    // which instance a container belongs to by matching the id against the end of its name.
    test('ends with the instance id', () => {
        const name = containerName({image: 'sandbox', username: 'alice', sessionId, instanceId})
        expect(name.endsWith(`.${instanceId}`)).toBe(true)
    })

    test('names task-executor containers the same way', () => {
        expect(containerName({image: 'task', username: 'bob', sessionId, instanceId}))
            .toBe(`task.bob.${instanceName(sessionId)}.i-0abc123`)
    })

    test('is a valid docker container name, local uuid instance ids included', () => {
        expect(containerName({
            image: 'sandbox',
            username: 'alice',
            sessionId,
            instanceId: '3f2b8c1a-9d44-4e21-8f77-2c6a5b0e91d3',
        })).toMatch(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/)
    })

    // Without this a reservation that lost its session id yields "sandbox.alice.null" — a name
    // that creates a container nothing will ever find again.
    test('throws rather than naming a container after a missing session', () => {
        expect(() => containerName({image: 'sandbox', username: 'alice', sessionId: null, instanceId}))
            .toThrow(/session/i)
    })

    // Same reasoning from the other end: a name without the instance id belongs to no instance
    // as far as the cleanup and the sweep are concerned, so the container would leak.
    test('throws rather than naming a container no instance can claim', () => {
        expect(() => containerName({image: 'sandbox', username: 'alice', sessionId, instanceId: null}))
            .toThrow(/instance id/i)
    })
})
