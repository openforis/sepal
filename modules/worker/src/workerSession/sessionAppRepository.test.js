import {jest} from '@jest/globals'

import {createSessionAppRepository} from './sessionAppRepository.js'

const FIXED_NOW = new Date('2026-07-10T12:00:00Z')

const createStubPool = rows => ({
    query: jest.fn(async () => [rows ?? [], undefined]),
})

describe('sessionAppRepository', () => {
    it('associate upserts by (username, app_path), storing the owning client', async () => {
        const pool = createStubPool()
        const repo = createSessionAppRepository(pool, () => FIXED_NOW)
        await repo.associate({username: 'bob', appPath: '/sandbox/shiny/foo', sessionId: 's-1', label: 'Foo', clientId: 'c-1'})
        const [sql, params] = pool.query.mock.calls[0]
        expect(sql).toMatch(/INSERT INTO session_app/i)
        expect(sql).toMatch(/ON DUPLICATE KEY UPDATE/i)
        expect(params).toEqual(['bob', '/sandbox/shiny/foo', 's-1', 'Foo', 'c-1', FIXED_NOW])
    })

    it('associate stores NULL for a missing clientId', async () => {
        const pool = createStubPool()
        const repo = createSessionAppRepository(pool, () => FIXED_NOW)
        await repo.associate({username: 'bob', appPath: '/sandbox/shiny/foo', sessionId: 's-1', label: 'Foo'})
        const [, params] = pool.query.mock.calls[0]
        expect(params).toEqual(['bob', '/sandbox/shiny/foo', 's-1', 'Foo', null, FIXED_NOW])
    })

    it('setClient updates only the owner of an existing association', async () => {
        const pool = createStubPool()
        const repo = createSessionAppRepository(pool, () => FIXED_NOW)
        await repo.setClient({username: 'bob', appPath: '/sandbox/shiny/foo', clientId: 'c-2'})
        const [sql, params] = pool.query.mock.calls[0]
        expect(sql).toMatch(/UPDATE session_app SET client_id = \? WHERE username = \? AND app_path = \?/i)
        expect(params).toEqual(['c-2', 'bob', '/sandbox/shiny/foo'])
    })

    it('userAppSessions joins open sessions only', async () => {
        const pool = createStubPool([{
            app_path: '/sandbox/shiny/foo', label: 'Foo', session_id: 's-1',
            host: '10.0.0.1', state: 'ACTIVE', instance_type: 'T3aSmall'
        }])
        const repo = createSessionAppRepository(pool, () => FIXED_NOW)
        const result = await repo.userAppSessions('bob')
        const [sql, params] = pool.query.mock.calls[0]
        expect(sql).toMatch(/JOIN worker_session/i)
        expect(params).toEqual(['bob', 'PENDING', 'ACTIVE'])
        expect(result).toEqual([{
            path: '/sandbox/shiny/foo', label: 'Foo', sessionId: 's-1',
            host: '10.0.0.1', status: 'ACTIVE', instanceType: 'T3aSmall'
        }])
    })

    it('appsForSessions groups rows by session id', async () => {
        const pool = createStubPool([
            {session_id: 's-1', app_path: '/sandbox/shiny/foo', label: 'Foo'},
            {session_id: 's-1', app_path: '/sandbox/jupyter/bar', label: 'Bar'},
            {session_id: 's-2', app_path: '/sandbox/shiny/baz', label: 'Baz'},
        ])
        const repo = createSessionAppRepository(pool, () => FIXED_NOW)
        const map = await repo.appsForSessions(['s-1', 's-2'])
        expect(map.get('s-1')).toEqual([
            {path: '/sandbox/shiny/foo', label: 'Foo'},
            {path: '/sandbox/jupyter/bar', label: 'Bar'},
        ])
        expect(map.get('s-2')).toEqual([{path: '/sandbox/shiny/baz', label: 'Baz'}])
    })

    it('appsForSessions with no ids skips the query', async () => {
        const pool = createStubPool()
        const repo = createSessionAppRepository(pool, () => FIXED_NOW)
        const map = await repo.appsForSessions([])
        expect(map.size).toBe(0)
        expect(pool.query).not.toHaveBeenCalled()
    })

    it('deleteForSession deletes by session id', async () => {
        const pool = createStubPool()
        const repo = createSessionAppRepository(pool, () => FIXED_NOW)
        await repo.deleteForSession('s-1')
        const [sql, params] = pool.query.mock.calls[0]
        expect(sql).toMatch(/DELETE FROM session_app WHERE session_id = \?/i)
        expect(params).toEqual(['s-1'])
    })

    it('dissociate deletes by (username, app_path) and returns the deleted row\'s session + owner', async () => {
        const pool = createStubPool([{session_id: 's-1', client_id: 'c-1'}])
        const repo = createSessionAppRepository(pool, () => FIXED_NOW)
        await expect(repo.dissociate({username: 'bob', appPath: '/sandbox/shiny/foo'}))
            .resolves.toEqual({sessionId: 's-1', clientId: 'c-1'})
        const [selectSql, selectParams] = pool.query.mock.calls[0]
        expect(selectSql).toMatch(/SELECT session_id, client_id FROM session_app/i)
        expect(selectParams).toEqual(['bob', '/sandbox/shiny/foo'])
        const [deleteSql, deleteParams] = pool.query.mock.calls[1]
        expect(deleteSql).toMatch(/DELETE FROM session_app WHERE username = \? AND app_path = \?/i)
        expect(deleteParams).toEqual(['bob', '/sandbox/shiny/foo'])
    })

    it('dissociate returns null (and does not delete) when no association existed', async () => {
        const pool = createStubPool([])
        const repo = createSessionAppRepository(pool, () => FIXED_NOW)
        await expect(repo.dissociate({username: 'bob', appPath: '/sandbox/shiny/foo'})).resolves.toBeNull()
        expect(pool.query).toHaveBeenCalledTimes(1) // SELECT only
    })

    it('dissociateForClient deletes every row owned by the client and returns them', async () => {
        const pool = createStubPool([
            {app_path: '/sandbox/shiny/foo', session_id: 's-1'},
            {app_path: '/sandbox/jupyter/lab', session_id: 's-2'},
        ])
        const repo = createSessionAppRepository(pool, () => FIXED_NOW)
        await expect(repo.dissociateForClient({username: 'bob', clientId: 'c-1'})).resolves.toEqual([
            {appPath: '/sandbox/shiny/foo', sessionId: 's-1'},
            {appPath: '/sandbox/jupyter/lab', sessionId: 's-2'},
        ])
        const [deleteSql, deleteParams] = pool.query.mock.calls[1]
        expect(deleteSql).toMatch(/DELETE FROM session_app WHERE username = \? AND client_id = \?/i)
        expect(deleteParams).toEqual(['bob', 'c-1'])
    })

    it('dissociateForClient with no owned rows deletes nothing', async () => {
        const pool = createStubPool([])
        const repo = createSessionAppRepository(pool, () => FIXED_NOW)
        await expect(repo.dissociateForClient({username: 'bob', clientId: 'c-1'})).resolves.toEqual([])
        expect(pool.query).toHaveBeenCalledTimes(1) // SELECT only
    })
})
