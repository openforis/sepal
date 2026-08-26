import {jest} from '@jest/globals'

import {createSandboxServerManager} from './sandboxServerManager.js'

const activeSession = {
    id: 'sess-1',
    username: 'alice',
    workerType: 'sandbox',
    instance: {id: 'i-0abc', host: '1.2.3.4'},
    state: 'ACTIVE',
}

const makeRepo = (session = activeSession) => ({
    getSession: jest.fn(async id =>
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
        const control = {startServer: jest.fn(async () => {})}
        const manager = createSandboxServerManager({repo: makeRepo(), control})
        await manager.ensureServerStarted({username: 'alice', sessionId: 'sess-1', endpoint: 'jupyter'})
        expect(control.startServer).toHaveBeenCalledWith(activeSession, 'jupyter')
    })

    it('starts each pair only once', async () => {
        const control = {startServer: jest.fn(async () => {})}
        const manager = createSandboxServerManager({repo: makeRepo(), control})
        await manager.ensureServerStarted({username: 'alice', sessionId: 'sess-1', endpoint: 'jupyter'})
        await manager.ensureServerStarted({username: 'alice', sessionId: 'sess-1', endpoint: 'jupyter'})
        expect(control.startServer).toHaveBeenCalledTimes(1)
    })

    it('starts a different endpoint on the same session separately', async () => {
        const control = {startServer: jest.fn(async () => {})}
        const manager = createSandboxServerManager({repo: makeRepo(), control})
        await manager.ensureServerStarted({username: 'alice', sessionId: 'sess-1', endpoint: 'jupyter'})
        await manager.ensureServerStarted({username: 'alice', sessionId: 'sess-1', endpoint: 'shiny'})
        expect(control.startServer).toHaveBeenCalledTimes(2)
    })

    it('shares one start between concurrent callers', async () => {
        const gate = deferred()
        const control = {startServer: jest.fn(() => gate.promise)}
        const manager = createSandboxServerManager({repo: makeRepo(), control})
        const first = manager.ensureServerStarted({username: 'alice', sessionId: 'sess-1', endpoint: 'shiny'})
        const second = manager.ensureServerStarted({username: 'alice', sessionId: 'sess-1', endpoint: 'shiny'})
        gate.resolve()
        await Promise.all([first, second])
        expect(control.startServer).toHaveBeenCalledTimes(1)
    })

    it('does not cache a failed start', async () => {
        const control = {startServer: jest.fn()
            .mockRejectedValueOnce(new Error('boom'))
            .mockResolvedValueOnce(undefined)}
        const manager = createSandboxServerManager({repo: makeRepo(), control})
        await expect(manager.ensureServerStarted({username: 'alice', sessionId: 'sess-1', endpoint: 'shiny'}))
            .rejects.toThrow('boom')
        await manager.ensureServerStarted({username: 'alice', sessionId: 'sess-1', endpoint: 'shiny'})
        expect(control.startServer).toHaveBeenCalledTimes(2)
    })

    it('rejects an unknown endpoint without touching the repo', async () => {
        const repo = makeRepo()
        const control = {startServer: jest.fn()}
        const manager = createSandboxServerManager({repo, control})
        await expect(manager.ensureServerStarted({username: 'alice', sessionId: 'sess-1', endpoint: 'sshd'}))
            .rejects.toThrow(/Unknown endpoint/)
        expect(repo.getSession).not.toHaveBeenCalled()
    })

    it('rejects a session owned by another user', async () => {
        const control = {startServer: jest.fn()}
        const manager = createSandboxServerManager({repo: makeRepo(), control})
        await expect(manager.ensureServerStarted({username: 'bob', sessionId: 'sess-1', endpoint: 'shiny'}))
            .rejects.toThrow(/not owned/i)
        expect(control.startServer).not.toHaveBeenCalled()
    })

    it('rejects a session that is not ACTIVE', async () => {
        const control = {startServer: jest.fn()}
        const manager = createSandboxServerManager({
            repo: makeRepo({...activeSession, state: 'PENDING'}), control})
        await expect(manager.ensureServerStarted({username: 'alice', sessionId: 'sess-1', endpoint: 'shiny'}))
            .rejects.toThrow(/not active/i)
        expect(control.startServer).not.toHaveBeenCalled()
    })

    it('rejects a non-existing session', async () => {
        const control = {startServer: jest.fn()}
        const manager = createSandboxServerManager({repo: makeRepo(), control})
        await expect(manager.ensureServerStarted({username: 'alice', sessionId: 'nope', endpoint: 'shiny'}))
            .rejects.toThrow(/Non-existing session/)
    })
})

describe('forget', () => {
    it('drops a session so its endpoints are started again', async () => {
        const control = {startServer: jest.fn(async () => {})}
        const manager = createSandboxServerManager({repo: makeRepo(), control})
        await manager.ensureServerStarted({username: 'alice', sessionId: 'sess-1', endpoint: 'shiny'})
        manager.forget('sess-1')
        await manager.ensureServerStarted({username: 'alice', sessionId: 'sess-1', endpoint: 'shiny'})
        expect(control.startServer).toHaveBeenCalledTimes(2)
    })
})
