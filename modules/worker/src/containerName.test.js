// Unit tests for the single container-name formula.
//
// The formula used to be written out at three call sites (create, start-server, stats). They must
// agree exactly or the container simply cannot be found, so it lives here once and they all call it.

import {containerName} from './containerName.js'
import {instanceName} from './instanceName.js'

describe('containerName', () => {
    const sessionId = '25a02f1c-9e59-491e-b5ac-80b95dcc274e'

    test('is the image, the username and the session\'s two-word name', () => {
        expect(containerName({image: 'sandbox', username: 'alice', sessionId}))
            .toBe(`sandbox.alice.${instanceName(sessionId)}`)
    })

    // The point of the change: the container carries the name the user already reads for the
    // instance, rather than a second identifier only the daemon knows.
    test('uses the name the user reads for that instance', () => {
        const name = containerName({image: 'sandbox', username: 'alice', sessionId})
        expect(name.endsWith(`.${instanceName(sessionId)}`)).toBe(true)
    })

    test('names task-executor containers the same way', () => {
        expect(containerName({image: 'task', username: 'bob', sessionId}))
            .toBe(`task.bob.${instanceName(sessionId)}`)
    })

    test('is a valid docker container name', () => {
        expect(containerName({image: 'sandbox', username: 'alice', sessionId}))
            .toMatch(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/)
    })

    // Without this a reservation that lost its session id yields "sandbox.alice.null" — a name
    // that creates a container nothing will ever find again.
    test('throws rather than naming a container after a missing session', () => {
        expect(() => containerName({image: 'sandbox', username: 'alice', sessionId: null}))
            .toThrow(/session/i)
    })
})
