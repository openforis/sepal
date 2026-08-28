import {jest} from '@jest/globals'

const createPool = jest.fn(async () => ({execute: jest.fn(), query: jest.fn(), destroy: jest.fn()}))
const initDatabase = jest.fn(async () => ({created: false, migrated: false, version: 1}))

jest.unstable_mockModule('#sepal/db/mysql', () => ({createPool, initDatabase}))

const {initializeDatabase} = await import('./database.js')

beforeEach(() => {
    createPool.mockClear()
    initDatabase.mockClear()
})

describe('initializeDatabase', () => {
    it('migrates the scene_metadata schema', async () => {
        const database = await initializeDatabase()

        expect(initDatabase).toHaveBeenCalledWith('scene_metadata', expect.stringMatching(/migrations$/))
        expect(database.prepare).toEqual(expect.any(Function))
    })

    it('is not created when the schema already existed', async () => {
        initDatabase.mockResolvedValueOnce({created: false, migrated: false, version: 1})

        const {created} = await initializeDatabase()

        expect(created).toBe(false)
    })

    it('is created when the schema was missing', async () => {
        initDatabase.mockResolvedValueOnce({created: true, migrated: true, version: 1})

        const {created} = await initializeDatabase()

        expect(created).toBe(true)
    })
})
