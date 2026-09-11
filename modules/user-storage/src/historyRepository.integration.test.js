import {join} from 'path'

import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'
import {createTestDb} from '#sepal/testSupport/db/testDb'

import {HistoryRepository} from './historyRepository.js'

// Fixtures whose outcome turns on the order of several events are written directly: `timestamp` is
// NOW() at one-second resolution and nothing breaks ties, so events recorded through addEvent could not
// state what their order should be.

describe('HistoryRepository', () => {
    let testDb
    let repository

    beforeAll(async () => {
        configureNoLogging()
        testDb = await createTestDb({name: 'user_storage_history', migrations: MIGRATIONS_PATH})
    })

    beforeEach(async () => {
        await testDb.reset()
        repository = new HistoryRepository(testDb.db)
    })

    afterAll(() => testDb?.remove())

    describe('addEvent', () => {
        test('records an event for a user', async () => {
            await repository.addEvent({username: OWNER, event: 'ACTIVE'})

            const events = await repository.getUserEvents(OWNER)
            expect(events.map(({event}) => event)).toEqual(['ACTIVE'])
        })

        test('stores the username in lowercase', async () => {
            await repository.addEvent({username: 'Bob', event: 'ACTIVE'})

            const stored = await storedEvents('bob')
            expect(stored).toEqual([{username: 'bob', event: 'ACTIVE'}])
        })

        // The read collapses repetitions, so only the rows themselves show that the second one was
        // never written.
        test('ignores an event repeating the one already recorded', async () => {
            await repository.addEvent({username: OWNER, event: 'ACTIVE'})

            await repository.addEvent({username: OWNER, event: 'ACTIVE'})

            const stored = await storedEvents(OWNER)
            expect(stored.map(({event}) => event)).toEqual(['ACTIVE'])
        })

        test('records an event that differs from the one already recorded', async () => {
            await repository.addEvent({username: OWNER, event: 'ACTIVE'})

            await repository.addEvent({username: OWNER, event: 'INACTIVE_LOW'})

            const stored = await storedEvents(OWNER)
            expect(stored.map(({event}) => event)).toEqual(['ACTIVE', 'INACTIVE_LOW'])
        })

        test('treats a differently cased name as the same user', async () => {
            await repository.addEvent({username: 'Bob', event: 'ACTIVE'})

            await repository.addEvent({username: 'BOB', event: 'ACTIVE'})

            const stored = await storedEvents('bob')
            expect(stored.map(({event}) => event)).toEqual(['ACTIVE'])
        })
    })

    describe('getMostRecentEvents', () => {
        test('reports nothing when nothing has been recorded', async () => {
            const recent = await repository.getMostRecentEvents()

            expect(recent).toEqual({})
        })

        test('reports the latest event of each user', async () => {
            await repository.addEvent({username: OWNER, event: 'ACTIVE'})
            await repository.addEvent({username: ANOTHER_OWNER, event: 'PURGED'})
            await repository.addEvent({username: OWNER, event: 'NOTIFIED'})

            const recent = await repository.getMostRecentEvents()

            expect(recent[OWNER]).toMatchObject({event: 'NOTIFIED'})
            expect(recent[ANOTHER_OWNER]).toMatchObject({event: 'PURGED'})
        })
    })

    describe('getUserEvents', () => {
        test('reports nothing for a user with no events', async () => {
            const events = await repository.getUserEvents(OWNER)

            expect(events).toEqual([])
        })

        test('reports the user\'s events, newest first', async () => {
            await givenEvents([
                {username: OWNER, event: 'ACTIVE', timestamp: at(1)},
                {username: OWNER, event: 'NOTIFIED', timestamp: at(2)},
                {username: OWNER, event: 'PURGED', timestamp: at(3)}
            ])

            const events = await repository.getUserEvents(OWNER)

            expect(events.map(({event}) => event)).toEqual(['PURGED', 'NOTIFIED', 'ACTIVE'])
        })

        test('reports only the user\'s own events', async () => {
            await repository.addEvent({username: OWNER, event: 'ACTIVE'})
            await repository.addEvent({username: ANOTHER_OWNER, event: 'PURGED'})

            const events = await repository.getUserEvents(OWNER)

            expect(events.map(({event}) => event)).toEqual(['ACTIVE'])
        })

        test('leaves out the unknown-storage retries', async () => {
            await givenEvents([
                {username: OWNER, event: 'ACTIVE', timestamp: at(1)},
                {username: OWNER, event: 'INACTIVE_UNKNOWN', timestamp: at(2)},
                {username: OWNER, event: 'NOTIFIED', timestamp: at(3)}
            ])

            const events = await repository.getUserEvents(OWNER)

            expect(events.map(({event}) => event)).toEqual(['NOTIFIED', 'ACTIVE'])
        })

        test('collapses a run of one repeated event into its most recent occurrence', async () => {
            await givenEvents([
                {username: OWNER, event: 'ACTIVE', timestamp: at(1)},
                {username: OWNER, event: 'ACTIVE', timestamp: at(2)},
                {username: OWNER, event: 'INACTIVE_LOW', timestamp: at(3)},
                {username: OWNER, event: 'ACTIVE', timestamp: at(4)}
            ])

            const events = await repository.getUserEvents(OWNER)

            expect(events.map(({event}) => event)).toEqual(['ACTIVE', 'INACTIVE_LOW', 'ACTIVE'])
            expect(events.map(({timestamp}) => timestamp)).toEqual([at(4), at(3), at(2)])
        })

        test('reports at most ten', async () => {
            const alternating = Array.from({length: 12}, (_value, index) => ({
                username: OWNER,
                event: index % 2 ? 'ACTIVE' : 'INACTIVE_LOW',
                timestamp: at(index + 1)
            }))
            await givenEvents(alternating)

            const events = await repository.getUserEvents(OWNER)

            expect(events).toHaveLength(10)
            expect(events[0].timestamp).toEqual(at(12))
        })
    })

    const givenEvents = async events => {
        for (const event of events) {
            await testDb.query('INSERT INTO history SET ?', event)
        }
    }

    // Only for what a read cannot show: the read collapses repetitions, so whether a row exists at all
    // has to be asked of the table.
    const storedEvents = async username => {
        const [rows] = await testDb.query(
            'SELECT username, event FROM history WHERE username = ? ORDER BY id', [username]
        )
        return rows
    }

    const at = minutes => new Date(Date.UTC(2026, 0, 1, 12, minutes))

    const OWNER = 'bob'
    const ANOTHER_OWNER = 'alice'

    const MIGRATIONS_PATH = join(dirName(import.meta.url), '../migrations')
})
