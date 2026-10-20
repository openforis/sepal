import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {callsOf} from '#sepal/testSupport/mock'

const createPool = mock.fn(async () => ({}))
const createDb = mock.fn(() => ({}))
const initDb = mock.fn(async () => ({created: false, migrated: false, version: 1}))

mock.module('#sepal/db/mysql', {
    exports: {
        createDb,
        createPool,
        initDb
    }
})

const {initializeDb} = await import('./db.js')

beforeEach(() => {
    createPool.mock.resetCalls()
    createDb.mock.resetCalls()
    initDb.mock.resetCalls()
})

describe('initializeDb', () => {
    it('migrates the scene_metadata schema', async () => {
        await initializeDb()

        const [[dbName, migrations, options]] = callsOf(initDb)
        assert.equal(dbName, 'scene_metadata')
        assert.ok(migrations.includes('/migrations'))
        assert.deepEqual(options, {label: 'schema migrations'})
    })

    it('is not created when an existing schema is migrated', async () => {
        initDb.mock.mockImplementationOnce(async () => ({
            created: false,
            migrated: true,
            version: 1
        }))

        const {created} = await initializeDb()

        assert.equal(created, false)
    })

    it('is created when the schema was missing', async () => {
        initDb.mock.mockImplementationOnce(async () => ({
            created: true,
            migrated: true,
            version: 1
        }))

        const {created} = await initializeDb()

        assert.equal(created, true)
    })

    it('waits for migrations before creating the adapter resources', async () => {
        const migrations = Promise.withResolvers()
        initDb.mock.mockImplementationOnce(() => migrations.promise)

        const initialization = initializeDb()

        assert.equal(createPool.mock.callCount(), 0)
        assert.equal(createDb.mock.callCount(), 0)
        migrations.resolve({created: false})
        await initialization
        assert.equal(createPool.mock.callCount(), 1)
    })

    it('propagates migration failure without constructing database resources', async () => {
        const error = new Error('Migration failed')
        initDb.mock.mockImplementationOnce(async () => {
            throw error
        })

        await assert.rejects(initializeDb(), thrown => thrown === error)

        assert.equal(createPool.mock.callCount(), 0)
        assert.equal(createDb.mock.callCount(), 0)
    })
})
