import {firstValueFrom, of} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('~/apiRegistry', () => ({
    default: {apps: {
        requestSession$: vi.fn(() => of({id: 's-1', status: 'STARTED'}))
    }}
}))

// The session report is pushed into the store by the worker/session websocket; runApp$ reads it
// through select/subscribe. `listeners` lets a test emit a new report the way a push would.
const APP = {path: '/sandbox/shiny/foo', endpoint: 'shiny'}
const listeners = []
let sessions

vi.mock('~/store', () => ({
    select: vi.fn(path => path === 'apps.list' ? [APP] : sessions),
    subscribe: vi.fn((_path, listener) => {
        listeners.push(listener)
        return () => listeners.splice(listeners.indexOf(listener), 1)
    })
}))

import api from '~/apiRegistry'

import {runApp$} from './apps'

const pushReport = nextSessions => {
    sessions = nextSessions
    listeners.forEach(listener => listener(nextSessions))
}

describe('runApp$', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        listeners.length = 0
        sessions = undefined
    })

    it('forwards the instance selection and app path', async () => {
        const session = await firstValueFrom(runApp$('/sandbox/shiny/foo', {instanceType: 'M6aXlarge'}))
        expect(api.apps.requestSession$).toHaveBeenCalledWith({
            endpoint: 'shiny', appPath: '/sandbox/shiny/foo', appLabel: undefined,
            sessionId: undefined, instanceType: 'M6aXlarge'
        })
        expect(session).toEqual({id: 's-1', status: 'STARTED'})
    })

    it('resolves immediately when the session is already reported ACTIVE', async () => {
        api.apps.requestSession$.mockReturnValueOnce(of({id: 's-1', status: 'STARTING'}))
        sessions = [{id: 's-1', status: 'ACTIVE'}]
        const session = await firstValueFrom(runApp$('/sandbox/shiny/foo', {}))
        expect(session).toEqual({id: 's-1', status: 'ACTIVE'})
    })

    it('reports the session via onSession, then waits for the report to say ACTIVE', async () => {
        api.apps.requestSession$.mockReturnValueOnce(of({id: 's-1', status: 'STARTING'}))
        const onSession = vi.fn()
        const sessionPromise = firstValueFrom(runApp$('/sandbox/shiny/foo', {onSession}))
        expect(onSession).toHaveBeenCalledWith({id: 's-1', status: 'STARTING'})

        pushReport([{id: 's-1', status: 'STARTING'}])
        pushReport([{id: 's-1', status: 'ACTIVE'}])

        expect(await sessionPromise).toEqual({id: 's-1', status: 'ACTIVE'})
    })

    it('ignores other users sessions in the report', async () => {
        api.apps.requestSession$.mockReturnValueOnce(of({id: 's-1', status: 'STARTING'}))
        const sessionPromise = firstValueFrom(runApp$('/sandbox/shiny/foo', {}))

        pushReport([{id: 's-other', status: 'ACTIVE'}, {id: 's-1', status: 'STARTING'}])
        pushReport([{id: 's-other', status: 'ACTIVE'}, {id: 's-1', status: 'ACTIVE'}])

        expect(await sessionPromise).toEqual({id: 's-1', status: 'ACTIVE'})
    })

    // A failed launch closes the session, so it drops out of the report. Without this the app tab
    // would spin forever instead of showing the failure.
    it('fails when the session disappears from the report before starting', async () => {
        api.apps.requestSession$.mockReturnValueOnce(of({id: 's-1', status: 'STARTING'}))
        const sessionPromise = firstValueFrom(runApp$('/sandbox/shiny/foo', {}))

        pushReport([{id: 's-1', status: 'STARTING'}])
        pushReport([])

        await expect(sessionPromise).rejects.toThrow('Session s-1 closed before it started')
    })

    // The session is absent from the store until the first push lands; that must not be mistaken
    // for a closed session.
    it('does not fail when the session is not in the report yet', async () => {
        api.apps.requestSession$.mockReturnValueOnce(of({id: 's-1', status: 'STARTING'}))
        const sessionPromise = firstValueFrom(runApp$('/sandbox/shiny/foo', {}))

        pushReport([])
        pushReport([{id: 's-1', status: 'STARTING'}])
        pushReport([{id: 's-1', status: 'ACTIVE'}])

        expect(await sessionPromise).toEqual({id: 's-1', status: 'ACTIVE'})
    })
})
