import {jest} from '@jest/globals'

process.env.MYSQL_HOST = 'host'
process.env.MYSQL_USER = 'user'
process.env.MYSQL_PASSWORD = 'password'

const state = {
    schemaCount: 1,
    maxVersion: 1,
    databaseVersion: 1
}

const query = jest.fn(async sql => {
    if (/SCHEMATA/.test(sql)) {
        return [[{count: state.schemaCount}]]
    }
    if (/installed_rank/.test(sql)) {
        return [[{count: 0}]]
    }
    return [[]]
})
const execute = jest.fn(async () => [{affectedRows: 1, warningStatus: 1}])
const end = jest.fn()
const createConnection = jest.fn(async () => ({query, execute, end}))

jest.unstable_mockModule('mysql2/promise', () => ({
    default: {createConnection, createPool: jest.fn()}
}))

const migrate = jest.fn()
const Postgrator = jest.fn(() => ({
    migrate,
    getMaxVersion: async () => state.maxVersion,
    getDatabaseVersion: async () => state.databaseVersion
}))

jest.unstable_mockModule('postgrator', () => ({default: Postgrator}))

const {initDatabase} = await import('./mysql.js')

beforeEach(() => {
    state.schemaCount = 1
    state.maxVersion = 1
    state.databaseVersion = 1
    query.mockClear()
    execute.mockClear()
    end.mockClear()
    migrate.mockClear()
})

describe('created', () => {
    it('is false when the schema is already present', async () => {
        state.schemaCount = 1
        const {created} = await initDatabase('db', '/migrations')
        expect(created).toBe(false)
    })

    it('is true when the schema is absent', async () => {
        state.schemaCount = 0
        const {created} = await initDatabase('db', '/migrations')
        expect(created).toBe(true)
    })

    it('checks the schema before the database is created', async () => {
        state.schemaCount = 0
        await initDatabase('db', '/migrations')
        const [sql, values] = query.mock.calls[0]
        expect(sql).toMatch(/information_schema\.SCHEMATA/)
        expect(values).toEqual(['db'])
        expect(query.mock.invocationCallOrder[0])
            .toBeLessThan(execute.mock.invocationCallOrder[0])
        expect(execute.mock.calls[0][0]).toMatch(/CREATE DATABASE IF NOT EXISTS db/)
    })
})

describe('migrated and version', () => {
    it('migrates to the max version when the database is behind', async () => {
        state.databaseVersion = 2
        state.maxVersion = 5
        const {migrated, version} = await initDatabase('db', '/migrations')
        expect(migrated).toBe(true)
        expect(version).toBe(5)
        expect(migrate).toHaveBeenCalled()
    })

    it('skips migration when the database is up to date', async () => {
        state.databaseVersion = 5
        state.maxVersion = 5
        const {migrated, version} = await initDatabase('db', '/migrations')
        expect(migrated).toBe(false)
        expect(version).toBe(5)
        expect(migrate).not.toHaveBeenCalled()
    })

    it('reports the actual version when the database is ahead', async () => {
        state.databaseVersion = 7
        state.maxVersion = 5
        const {migrated, version} = await initDatabase('db', '/migrations')
        expect(migrated).toBe(false)
        expect(version).toBe(7)
    })

    it('reports the version as a number even when the driver returns strings', async () => {
        state.databaseVersion = '2'
        state.maxVersion = '10'
        const {migrated, version} = await initDatabase('db', '/migrations')
        expect(migrated).toBe(true)
        expect(version).toBe(10)
    })
})
