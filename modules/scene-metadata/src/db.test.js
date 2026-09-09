import {jest} from '@jest/globals'

const createPool = jest.fn(async () => ({execute: jest.fn(), query: jest.fn(), destroy: jest.fn()}))
const migrateSceneMetadataDb = jest.fn(async () => ({created: false, migrated: false, version: 1}))

jest.unstable_mockModule('#sepal/db/mysql', () => ({createPool}))
jest.unstable_mockModule('./databaseMigrations.js', () => ({migrateSceneMetadataDb}))

const {initializeDatabase} = await import('./db.js')

beforeEach(() => {
    createPool.mockClear()
    migrateSceneMetadataDb.mockClear()
})

describe('initializeDatabase', () => {
    it('migrates the scene_metadata schema', async () => {
        const database = await initializeDatabase()

        expect(migrateSceneMetadataDb).toHaveBeenCalledWith('scene_metadata', expect.anything())
        expect(database.prepare).toEqual(expect.any(Function))
    })

    it('is not created when the schema already existed', async () => {
        migrateSceneMetadataDb.mockResolvedValueOnce({created: false, migrated: false, version: 1})

        const {created} = await initializeDatabase()

        expect(created).toBe(false)
    })

    it('is created when the schema was missing', async () => {
        migrateSceneMetadataDb.mockResolvedValueOnce({created: true, migrated: true, version: 1})

        const {created} = await initializeDatabase()

        expect(created).toBe(true)
    })
})
