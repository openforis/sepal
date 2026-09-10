// Unit tests for claimRepository.js
// Mocks db.js so no database is needed — verifies SQL strings, params, and return values.
// Concurrency is covered in claimRepository.integration.test.js against real MySQL.

import {jest} from '@jest/globals'

const query = jest.fn()
const mockPool = {query}

jest.unstable_mockModule('../db.js', () => ({
    getPool: () => mockPool
}))

const {createClaimRepository} = await import('./claimRepository.js')
const {all, claim, release} = createClaimRepository()

beforeEach(() => query.mockReset())

describe('claim', () => {
    test('INSERTs instance_id and session_id, returns true', async () => {
        query.mockResolvedValue([{affectedRows: 1}, []])
        const won = await claim('i-001', 's-42')
        const [sql, params] = query.mock.calls[0]
        expect(sql).toMatch(/INSERT INTO instance_claim\(instance_id, session_id\) VALUES\(\?, \?\)/i)
        expect(params).toEqual(['i-001', 's-42'])
        expect(won).toBe(true)
    })

    // The primary key IS the arbiter — no affectedRows interpretation is involved.
    test('returns false when the row already exists', async () => {
        const duplicate = new Error('Duplicate entry')
        duplicate.code = 'ER_DUP_ENTRY'
        query.mockRejectedValue(duplicate)
        expect(await claim('i-001', 's-42')).toBe(false)
    })

    test('rethrows any other database error', async () => {
        query.mockRejectedValue(new Error('db down'))
        await expect(claim('i-001', 's-42')).rejects.toThrow('db down')
    })
})

describe('release', () => {
    test('DELETEs by instance_id, true when a row was removed', async () => {
        query.mockResolvedValue([{affectedRows: 1}, []])
        const released = await release('i-001')
        const [sql, params] = query.mock.calls[0]
        expect(sql).toMatch(/DELETE FROM instance_claim WHERE instance_id = \?/i)
        expect(params).toEqual(['i-001'])
        expect(released).toBe(true)
    })

    test('false when no row matched', async () => {
        query.mockResolvedValue([{affectedRows: 0}, []])
        expect(await release('i-001')).toBe(false)
    })
})

describe('all', () => {
    test('maps rows to camelCase with claimedAt as a Date', async () => {
        query.mockResolvedValue([[
            {instance_id: 'i-001', session_id: 's-42', claimed_at: '2026-09-09T10:00:00Z'},
        ], []])
        const claims = await all()
        expect(claims).toEqual([
            {instanceId: 'i-001', sessionId: 's-42', claimedAt: new Date('2026-09-09T10:00:00Z')},
        ])
    })
})
