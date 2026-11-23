import assert from 'node:assert/strict'
import {join} from 'node:path'
import {after, before, beforeEach, describe, test} from 'node:test'
import {setTimeout} from 'node:timers/promises'

import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'
import {createTestDb} from '#sepal/testSupport/db/testDb'

import {HistoryRepository} from './historyRepository.js'

// Fixtures whose outcome turns on the order of several events are written directly: `timestamp` is the
// time of the write at one-second resolution, so events recorded through addEvent could not state what
// their order should be.

describe('HistoryRepository', () => {
    let testDb
    let repository

    before(async () => {
        configureNoLogging()
        testDb = await createTestDb({name: 'storage_history', migrations: MIGRATIONS_PATH, connections: 2})
    })

    beforeEach(async () => {
        await testDb.reset()
        repository = new HistoryRepository(testDb.db)
    })

    after(() => testDb?.remove())

    describe('addEvent', () => {
        test('records an event for a user', async () => {
            await repository.addEvent({username: OWNER, event: 'ACTIVE'})

            const events = await repository.getUserEvents(OWNER)
            assert.deepEqual(events.map(({event}) => event), ['ACTIVE'])
        })

        test('stores the username in lowercase', async () => {
            await repository.addEvent({username: 'Bob', event: 'ACTIVE'})

            const stored = await storedEvents('bob')
            assert.deepEqual(stored, [{username: 'bob', event: 'ACTIVE'}])
        })

        // The read collapses repetitions, so only the rows themselves show that the second one was
        // never written.
        test('ignores an event repeating the one already recorded', async () => {
            await repository.addEvent({username: OWNER, event: 'ACTIVE'})

            await repository.addEvent({username: OWNER, event: 'ACTIVE'})

            const stored = await storedEvents(OWNER)
            assert.deepEqual(stored.map(({event}) => event), ['ACTIVE'])
        })

        test('records an event that differs from the one already recorded', async () => {
            await repository.addEvent({username: OWNER, event: 'ACTIVE'})

            await repository.addEvent({username: OWNER, event: 'INACTIVE_LOW'})

            const stored = await storedEvents(OWNER)
            assert.deepEqual(stored.map(({event}) => event), ['ACTIVE', 'INACTIVE_LOW'])
        })

        test('treats a differently cased name as the same user', async () => {
            await repository.addEvent({username: 'Bob', event: 'ACTIVE'})

            await repository.addEvent({username: 'BOB', event: 'ACTIVE'})

            const stored = await storedEvents('bob')
            assert.deepEqual(stored.map(({event}) => event), ['ACTIVE'])
        })

        // A single race is often won by luck, so several users race in turn.
        test('serialises concurrent events for one user', async () => {
            const users = Array.from({length: 30}, (_value, index) => `racer${index}`)

            for (const username of users) {
                await Promise.all([
                    repository.addEvent({username, event: 'ACTIVE'}),
                    repository.addEvent({username, event: 'ACTIVE'})
                ])
            }

            const {rows} = await testDb.query('SELECT username, count(*) AS events FROM history GROUP BY username')
            assert.equal(rows.length, users.length)
            assert.ok(rows.every(({events}) => events === 1))
        })

        test('compares against the event with the highest id when several share the latest second', async () => {
            await givenEvents([
                {username: OWNER, event: 'ACTIVE', timestamp: at(1)},
                {username: OWNER, event: 'NOTIFIED', timestamp: at(1)}
            ])

            await repository.addEvent({username: OWNER, event: 'NOTIFIED'})

            const stored = await storedEvents(OWNER)
            assert.deepEqual(stored.map(({event}) => event), ['ACTIVE', 'NOTIFIED'])
        })

        // The write is held back as it would be behind another writer's lock on the same user.
        test('stamps an event when it is written, not when its transaction began', async () => {
            const held = heldWrites(testDb.db, {when: sql => sql.includes('INSERT INTO history'), ms: WRITE_DELAY_MS})

            await new HistoryRepository(held.db).addEvent({username: OWNER, event: 'ACTIVE'})

            const [{timestamp}] = await repository.getUserEvents(OWNER)
            assert.ok(
                timestamp.getTime() >= held.writtenAt.getTime() - TIMESTAMP_ROUNDING_MS,
                `stamped ${timestamp.toISOString()}, written at ${held.writtenAt.toISOString()}`
            )
        })
    })

    describe('getMostRecentEvents', () => {
        test('reports nothing when nothing has been recorded', async () => {
            const recent = await repository.getMostRecentEvents()

            assert.deepEqual(recent, {})
        })

        test('reports the latest event of each user', async () => {
            await repository.addEvent({username: OWNER, event: 'ACTIVE'})
            await repository.addEvent({username: ANOTHER_OWNER, event: 'PURGED'})
            await repository.addEvent({username: OWNER, event: 'NOTIFIED'})

            const recent = await repository.getMostRecentEvents()

            assert.partialDeepStrictEqual(recent[OWNER], {event: 'NOTIFIED'})
            assert.partialDeepStrictEqual(recent[ANOTHER_OWNER], {event: 'PURGED'})
        })
    })

    describe('getUserEvents', () => {
        test('reports nothing for a user with no events', async () => {
            const events = await repository.getUserEvents(OWNER)

            assert.deepEqual(events, [])
        })

        test('reports the user\'s events, newest first', async () => {
            await givenEvents([
                {username: OWNER, event: 'ACTIVE', timestamp: at(1)},
                {username: OWNER, event: 'NOTIFIED', timestamp: at(2)},
                {username: OWNER, event: 'PURGED', timestamp: at(3)}
            ])

            const events = await repository.getUserEvents(OWNER)

            assert.deepEqual(events.map(({event}) => event), ['PURGED', 'NOTIFIED', 'ACTIVE'])
        })

        test('reports only the user\'s own events', async () => {
            await repository.addEvent({username: OWNER, event: 'ACTIVE'})
            await repository.addEvent({username: ANOTHER_OWNER, event: 'PURGED'})

            const events = await repository.getUserEvents(OWNER)

            assert.deepEqual(events.map(({event}) => event), ['ACTIVE'])
        })

        test('leaves out the unknown-storage retries', async () => {
            await givenEvents([
                {username: OWNER, event: 'ACTIVE', timestamp: at(1)},
                {username: OWNER, event: 'INACTIVE_UNKNOWN', timestamp: at(2)},
                {username: OWNER, event: 'NOTIFIED', timestamp: at(3)}
            ])

            const events = await repository.getUserEvents(OWNER)

            assert.deepEqual(events.map(({event}) => event), ['NOTIFIED', 'ACTIVE'])
        })

        test('collapses a run of one repeated event into its most recent occurrence', async () => {
            await givenEvents([
                {username: OWNER, event: 'ACTIVE', timestamp: at(1)},
                {username: OWNER, event: 'ACTIVE', timestamp: at(2)},
                {username: OWNER, event: 'INACTIVE_LOW', timestamp: at(3)},
                {username: OWNER, event: 'ACTIVE', timestamp: at(4)}
            ])

            const events = await repository.getUserEvents(OWNER)

            assert.deepEqual(events.map(({event}) => event), ['ACTIVE', 'INACTIVE_LOW', 'ACTIVE'])
            assert.deepEqual(events.map(({timestamp}) => timestamp), [at(4), at(3), at(2)])
        })

        test('reports at most ten', async () => {
            const alternating = Array.from({length: 12}, (_value, index) => ({
                username: OWNER,
                event: index % 2 ? 'ACTIVE' : 'INACTIVE_LOW',
                timestamp: at(index + 1)
            }))
            await givenEvents(alternating)

            const events = await repository.getUserEvents(OWNER)

            assert.equal(events.length, 10)
            assert.deepEqual(events[0].timestamp, at(12))
        })
    })

    const givenEvents = async events => {
        for (const event of events) {
            await testDb.query(
                'INSERT INTO history (username, event, timestamp) VALUES ($1, $2, $3)',
                [event.username, event.event, event.timestamp]
            )
        }
    }

    // Only for what a read cannot show: the read collapses repetitions, so whether a row exists at all
    // has to be asked of the table.
    const storedEvents = async username => {
        const {rows} = await testDb.query(
            'SELECT username, event FROM history WHERE username = $1 ORDER BY id', [username]
        )
        return rows
    }

    const at = minutes => new Date(Date.UTC(2026, 0, 1, 12, minutes))

    // Delays the first statement `when` selects, and notes when it went to the database.
    const heldWrites = (db, {when, ms}) => {
        const held = {writtenAt: null}
        const holding = connection => ({
            query: async (sql, params) => {
                if (!held.writtenAt && when(sql, params)) {
                    await setTimeout(ms)
                    held.writtenAt = new Date()
                }
                return connection.query(sql, params)
            }
        })
        held.db = {
            withTransaction: run => db.withTransaction(connection => run(holding(connection))),
            withConnection: run => db.withConnection(connection => run(holding(connection)))
        }
        return held
    }

    // timestamptz(0) rounds to the nearest second; an event stamped at its transaction's start would fall
    // the whole delay short.
    const TIMESTAMP_ROUNDING_MS = 500
    const WRITE_DELAY_MS = 2000

    const OWNER = 'bob'
    const ANOTHER_OWNER = 'alice'

    const MIGRATIONS_PATH = join(dirName(import.meta.url), '../migrations')
})
