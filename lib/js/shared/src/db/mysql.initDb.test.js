import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {callsOf} from '#sepal/testSupport/mock'

process.env.MYSQL_HOST = 'host'
process.env.MYSQL_USER = 'user'
process.env.MYSQL_PASSWORD = 'password'

const state = {
    schemaCount: 1,
    maxVersion: 1,
    databaseVersion: 1
}

const statements = []
const query = mock.fn(async sql => {
    statements.push('query')
    if (/SCHEMATA/.test(sql)) {
        return [[{count: state.schemaCount}]]
    }
    if (/installed_rank/.test(sql)) {
        return [[{count: 0}]]
    }
    return [[]]
})
const execute = mock.fn(async () => {
    statements.push('execute')
    return [{affectedRows: 1, warningStatus: 1}]
})
const end = mock.fn()
const createConnection = mock.fn(async () => ({query, execute, end}))

mock.module('mysql2/promise', {
    exports: {
        default: {createConnection, createPool: mock.fn()}
    }
})

const migrate = mock.fn()
const validateMigrations = mock.fn()
const Postgrator = mock.fn(function () {
    return {
        migrate,
        validateMigrations,
        getMaxVersion: async () => state.maxVersion,
        getDatabaseVersion: async () => state.databaseVersion
    }
})

mock.module('postgrator', {
    exports: {
        default: Postgrator
    }
})

const {initDb, migrateDb} = await import('./mysql.js')

beforeEach(() => {
    state.schemaCount = 1
    state.maxVersion = 1
    state.databaseVersion = 1
    statements.length = 0
    query.mock.resetCalls()
    execute.mock.resetCalls()
    end.mock.resetCalls()
    migrate.mock.resetCalls()
    validateMigrations.mock.resetCalls()
})

describe('created', () => {
    it('is false when the schema is already present', async () => {
        state.schemaCount = 1
        const {created} = await initDb('db', '/migrations')
        assert.equal(created, false)
    })

    it('is true when the schema is absent', async () => {
        state.schemaCount = 0
        const {created} = await initDb('db', '/migrations')
        assert.equal(created, true)
    })

    it('checks the schema before the database is created', async () => {
        state.schemaCount = 0
        await initDb('db', '/migrations')
        const [sql, values] = query.mock.calls[0].arguments
        assert.match(sql, /information_schema\.SCHEMATA/)
        assert.deepEqual(values, ['db'])
        assert.ok(statements.indexOf('query') < statements.indexOf('execute'))
        assert.match(execute.mock.calls[0].arguments[0], /CREATE DATABASE IF NOT EXISTS db/)
    })
})

describe('migrated and version', () => {
    it('migrates to the max version when the database is behind', async () => {
        state.databaseVersion = 2
        state.maxVersion = 5
        const {migrated, version} = await initDb('db', '/migrations')
        assert.equal(migrated, true)
        assert.equal(version, 5)
        assert.ok(migrate.mock.callCount() > 0)
    })

    it('validates history without rerunning an up-to-date migration', async () => {
        state.databaseVersion = 5
        state.maxVersion = 5
        const {migrated, version} = await initDb('db', '/migrations')
        assert.equal(migrated, false)
        assert.equal(version, 5)
        assert.equal(migrate.mock.callCount(), 0)
        assert.deepEqual(callsOf(validateMigrations), [[5]])
    })

    it('reports the actual version when the database is ahead', async () => {
        state.databaseVersion = 7
        state.maxVersion = 5
        const {migrated, version} = await initDb('db', '/migrations')
        assert.equal(migrated, false)
        assert.equal(version, 7)
    })

    it('reports the version as a number even when the driver returns strings', async () => {
        state.databaseVersion = '2'
        state.maxVersion = '10'
        const {migrated, version} = await initDb('db', '/migrations')
        assert.equal(migrated, true)
        assert.equal(version, 10)
    })
})

describe('migrateDb', () => {
    it('migrates without creating the database', async () => {
        state.databaseVersion = 2
        state.maxVersion = 5
        const result = await migrateDb('db', '/migrations')
        assert.deepEqual(result, {migrated: true, version: 5})
        assert.equal(execute.mock.callCount(), 0)
    })
})
