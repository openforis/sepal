import assert from 'node:assert/strict'
import {describe, it, mock} from 'node:test'

import {callsOf, inSequence} from '#sepal/testSupport/mock'

import {createSandboxServerManager} from './sandboxServerManager.js'

const activeSession = {
    id: 'sess-1',
    username: 'alice',
    workerType: 'sandbox',
    instance: {id: 'i-0abc', host: '1.2.3.4'},
    state: 'ACTIVE',
}

const makeRepo = (session = activeSession) => ({
    getSession: mock.fn(async id =>
        id === session.id ? session : Promise.reject(new Error('no such session'))),
})

const deferred = () => {
    let resolve, reject
    const promise = new Promise((res, rej) => {
        resolve = res
        reject = rej
    })
    return {promise, resolve, reject}
}

describe('ensureServerStarted', () => {
    it('starts the endpoint on the session instance', async () => {
        const control = {startServer: mock.fn(async () => {})}
        const manager = createSandboxServerManager({repo: makeRepo(), control})
        await manager.ensureServerStarted({username: 'alice', sessionId: 'sess-1', endpoint: 'jupyter'})
        assert.deepEqual(callsOf(control.startServer), [[activeSession, 'jupyter']])
    })

    it('starts an already started pair again, so a dead server can be revived', async () => {
        const control = {startServer: mock.fn(async () => {})}
        const manager = createSandboxServerManager({repo: makeRepo(), control})
        await manager.ensureServerStarted({username: 'alice', sessionId: 'sess-1', endpoint: 'jupyter'})
        await manager.ensureServerStarted({username: 'alice', sessionId: 'sess-1', endpoint: 'jupyter'})
        assert.equal(control.startServer.mock.callCount(), 2)
    })

    it('shares one start between concurrent callers', async () => {
        const gate = deferred()
        const control = {startServer: mock.fn(() => gate.promise)}
        const manager = createSandboxServerManager({repo: makeRepo(), control})
        const first = manager.ensureServerStarted({username: 'alice', sessionId: 'sess-1', endpoint: 'shiny'})
        const second = manager.ensureServerStarted({username: 'alice', sessionId: 'sess-1', endpoint: 'shiny'})
        gate.resolve()
        await Promise.all([first, second])
        assert.equal(control.startServer.mock.callCount(), 1)
    })

    it('does not cache a failed start', async () => {
        const control = {startServer: mock.fn(inSequence([async () => {
            throw new Error('boom')
        }, async () => undefined]))}
        const manager = createSandboxServerManager({repo: makeRepo(), control})
        await assert.rejects(
            manager.ensureServerStarted({username: 'alice', sessionId: 'sess-1', endpoint: 'shiny'}),
            /boom/
        )
        await manager.ensureServerStarted({username: 'alice', sessionId: 'sess-1', endpoint: 'shiny'})
        assert.equal(control.startServer.mock.callCount(), 2)
    })

    it('rejects an unknown endpoint without touching the repo', async () => {
        const repo = makeRepo()
        const control = {startServer: mock.fn()}
        const manager = createSandboxServerManager({repo, control})
        await assert.rejects(
            manager.ensureServerStarted({username: 'alice', sessionId: 'sess-1', endpoint: 'sshd'}),
            /Unknown endpoint/
        )
        assert.equal(repo.getSession.mock.callCount(), 0)
    })

    it('rejects a session owned by another user', async () => {
        const control = {startServer: mock.fn()}
        const manager = createSandboxServerManager({repo: makeRepo(), control})
        await assert.rejects(
            manager.ensureServerStarted({username: 'bob', sessionId: 'sess-1', endpoint: 'shiny'}),
            /not owned/i
        )
        assert.equal(control.startServer.mock.callCount(), 0)
    })

    it('rejects a session that is not ACTIVE', async () => {
        const control = {startServer: mock.fn()}
        const manager = createSandboxServerManager({
            repo: makeRepo({...activeSession, state: 'PENDING'}), control})
        await assert.rejects(
            manager.ensureServerStarted({username: 'alice', sessionId: 'sess-1', endpoint: 'shiny'}),
            /not active/i
        )
        assert.equal(control.startServer.mock.callCount(), 0)
    })

    it('rejects a non-existing session', async () => {
        const control = {startServer: mock.fn()}
        const manager = createSandboxServerManager({repo: makeRepo(), control})
        await assert.rejects(
            manager.ensureServerStarted({username: 'alice', sessionId: 'nope', endpoint: 'shiny'}),
            /Non-existing session/
        )
    })
})
