import {jest} from '@jest/globals'

const createPool = jest.fn(async () => ({}))
const createDb = jest.fn(() => ({}))
const initDb = jest.fn(async () => ({created: false, migrated: false, version: 1}))

jest.unstable_mockModule('#sepal/db/mysql', () => ({createDb, createPool, initDb}))

const {initializeDb} = await import('./db.js')

beforeEach(() => {
    createPool.mockClear()
    createDb.mockClear()
    initDb.mockClear()
})

describe('initializeDb', () => {
    it('migrates the scene_metadata schema', async () => {
        await initializeDb()

        expect(initDb).toHaveBeenCalledWith('scene_metadata', expect.stringContaining('/migrations'), {label: 'schema migrations'})
    })

    it('is not created when an existing schema is migrated', async () => {
        initDb.mockResolvedValueOnce({created: false, migrated: true, version: 1})

        const {created} = await initializeDb()

        expect(created).toBe(false)
    })

    it('is created when the schema was missing', async () => {
        initDb.mockResolvedValueOnce({created: true, migrated: true, version: 1})

        const {created} = await initializeDb()

        expect(created).toBe(true)
    })

    it('waits for migrations before creating the adapter resources', async () => {
        const migrations = Promise.withResolvers()
        initDb.mockReturnValueOnce(migrations.promise)

        const initialization = initializeDb()

        expect(createPool).not.toHaveBeenCalled()
        expect(createDb).not.toHaveBeenCalled()
        migrations.resolve({created: false})
        await initialization
        expect(createPool).toHaveBeenCalledTimes(1)
    })

    it('propagates migration failure without constructing database resources', async () => {
        const error = new Error('Migration failed')
        initDb.mockRejectedValueOnce(error)

        await expect(initializeDb()).rejects.toBe(error)

        expect(createPool).not.toHaveBeenCalled()
        expect(createDb).not.toHaveBeenCalled()
    })
})
