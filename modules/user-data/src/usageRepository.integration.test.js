import {join} from 'node:path'

import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'
import {createTestDb} from '#sepal/testSupport/db/testDb'

import {UsageRepository} from './usageRepository.js'

let testDb
let now
let repository

beforeAll(async () => {
    configureNoLogging()
    testDb = await createTestDb({name: 'user_data_usage', migrations: MIGRATIONS_PATH})
})

beforeEach(async () => {
    await testDb.reset()
    now = new Date('2026-10-13T10:00:00Z')
    repository = new UsageRepository(testDb.db, () => now)
})

afterAll(() => testDb?.remove())

describe('dirty users', () => {
    it('are the users marked since their last measurement', async () => {
        await repository.markDirty('alice')
        await repository.markDirty('bob')
        await repository.recordMeasurement('bob', 10, now)

        expect(await repository.dirtyUsernames()).toEqual(['alice'])
    })

    it('stay dirty when marked again, from the latest mark', async () => {
        await repository.markDirty('alice')
        now = new Date('2026-10-13T11:00:00Z')

        await repository.markDirty('alice')

        expect(await dirtySince('alice')).toEqual(new Date('2026-10-13T11:00:00Z'))
    })

    it('stay dirty when marked while a measurement ran', async () => {
        await repository.markDirty('alice')
        const measuredFrom = new Date('2026-10-13T10:00:00.200Z')
        now = new Date('2026-10-13T10:00:00.400Z')
        await repository.markDirty('alice')
        now = new Date('2026-10-13T10:00:05Z')

        await repository.recordMeasurement('alice', 10, measuredFrom)

        expect(await repository.dirtyUsernames()).toEqual(['alice'])
    })

    it('are clean once measured after their latest mark', async () => {
        await repository.markDirty('alice')
        const measuredFrom = new Date('2026-10-13T10:00:00.200Z')
        now = new Date('2026-10-13T10:00:05Z')

        await repository.recordMeasurement('alice', 10, measuredFrom)

        expect(await repository.dirtyUsernames()).toEqual([])
    })

    it('are dirty again when marked after a measurement', async () => {
        await repository.markDirty('alice')
        await repository.recordMeasurement('alice', 10, now)

        await repository.markDirty('alice')

        expect(await repository.dirtyUsernames()).toEqual(['alice'])
    })
})

describe('measurements', () => {
    it('are the recorded sizes of the measured users, by username', async () => {
        await repository.recordMeasurement('carol', 0, now)
        await repository.recordMeasurement('alice', 1234, now)
        await repository.markDirty('bob')

        expect(await repository.measurements()).toEqual([
            {username: 'alice', size: 1234},
            {username: 'carol', size: 0}
        ])
    })
})

describe('erase requests', () => {
    it('are the users purged and not yet erased, oldest first', async () => {
        await repository.requestErase('bob')
        now = new Date('2026-10-13T11:00:00Z')
        await repository.requestErase('alice')
        await repository.requestErase('carol')
        await repository.markDirty('dave')

        expect((await repository.eraseRequests()).map(({username}) => username)).toEqual(['bob', 'alice', 'carol'])
    })

    it('keep the first request time when requested again', async () => {
        const first = await repository.requestErase('alice')
        now = new Date('2026-10-13T11:00:00Z')

        const again = await repository.requestErase('alice')

        expect(first).toEqual(new Date('2026-10-13T10:00:00Z'))
        expect(again).toEqual(first)
        expect(await repository.eraseRequests()).toEqual([{username: 'alice', requestedAt: first}])
    })

    it('are gone once cleared', async () => {
        await repository.requestErase('alice')
        await repository.requestErase('bob')

        await repository.clearEraseRequest('alice')

        expect((await repository.eraseRequests()).map(({username}) => username)).toEqual(['bob'])
    })
})

describe('measurements', () => {
    it('record the size and time, and make the user known', async () => {
        await repository.recordMeasurement('alice', 1234, now)

        const [rows] = await testDb.query('SELECT username, size, measured_at FROM data_usage')
        expect(rows).toEqual([{username: 'alice', size: 1234, measured_at: now}])
        expect(await repository.knownUsernames()).toEqual(['alice'])
        expect(await repository.isKnown('Alice')).toBe(true)
    })
})

describe('known users', () => {
    it('do not include a user never seen', async () => {
        expect(await repository.isKnown('alice')).toBe(false)
    })
})

const dirtySince = async username => {
    const [rows] = await testDb.query('SELECT dirty_since FROM data_usage WHERE username = ?', [username])
    return rows[0].dirty_since
}

const MIGRATIONS_PATH = join(dirName(import.meta.url), '../migrations')
