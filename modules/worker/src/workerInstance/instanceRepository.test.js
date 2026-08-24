// Unit tests for instanceRepository.js
// Mocks db.js so no database is needed — verifies SQL strings, params, and return values.
// Integration / race-safe tests live in instanceRepository.integration.test.js.

import {jest} from '@jest/globals'

const query = jest.fn()
const mockPool = {query}

jest.unstable_mockModule('../db.js', () => ({
    getPool: () => mockPool
}))

const {idleInstances, launched, released, reserved, terminated} =
    await import('./instanceRepository.js')

beforeEach(() => query.mockReset())

describe('launched — single instance', () => {
    test('executes INSERT with id, type, null worker_type when no reservation', async () => {
        query.mockResolvedValue([{affectedRows: 1}, []])
        await launched({id: 'i-001', type: 'm4.xlarge'})
        expect(query).toHaveBeenCalledTimes(1)
        const [sql, params] = query.mock.calls[0]
        expect(sql).toMatch(/INSERT INTO instance\(id, type, worker_type\) VALUES\(\?, \?, \?\)/i)
        expect(params).toEqual(['i-001', 'm4.xlarge', null])
    })

    test('uses reservation.workerType when present', async () => {
        query.mockResolvedValue([{affectedRows: 1}, []])
        await launched({id: 'i-002', type: 'm4.xlarge', reservation: {workerType: 'SANDBOX'}})
        const [, params] = query.mock.calls[0]
        expect(params).toEqual(['i-002', 'm4.xlarge', 'SANDBOX'])
    })
})

describe('launched — array form', () => {
    test('inserts each instance individually in order', async () => {
        query.mockResolvedValue([{affectedRows: 1}, []])
        await launched([
            {id: 'i-010', type: 'c5.xlarge'},
            {id: 'i-011', type: 'c5.xlarge', reservation: {workerType: 'TASK_EXECUTOR'}},
        ])
        expect(query).toHaveBeenCalledTimes(2)
        const [, p0] = query.mock.calls[0]
        const [, p1] = query.mock.calls[1]
        expect(p0).toEqual(['i-010', 'c5.xlarge', null])
        expect(p1).toEqual(['i-011', 'c5.xlarge', 'TASK_EXECUTOR'])
    })

    test('empty array → no queries', async () => {
        await launched([])
        expect(query).not.toHaveBeenCalled()
    })
})

describe('reserved', () => {
    test('UPDATE sql targets id AND worker_type IS NULL (race-safe guard)', async () => {
        query.mockResolvedValue([{affectedRows: 1}, []])
        const result = await reserved('i-001', 'SANDBOX')
        const [sql, params] = query.mock.calls[0]
        expect(sql).toMatch(/UPDATE instance SET worker_type = \? WHERE id = \? AND worker_type IS NULL/i)
        expect(params).toEqual(['SANDBOX', 'i-001'])
        expect(result).toBe(true)
    })

    test('returns false when affectedRows is 0 (instance already reserved or missing)', async () => {
        query.mockResolvedValue([{affectedRows: 0}, []])
        const result = await reserved('i-001', 'SANDBOX')
        expect(result).toBe(false)
    })

    test('is a single UPDATE — never issues a SELECT before it', async () => {
        query.mockResolvedValue([{affectedRows: 1}, []])
        await reserved('i-003', 'TASK_EXECUTOR')
        // Only one query call — no read-then-write pattern
        expect(query).toHaveBeenCalledTimes(1)
    })
})

describe('released', () => {
    test('UPDATE sets worker_type = NULL for the given id', async () => {
        // changedRows=1 means the row existed and worker_type was actually changed.
        query.mockResolvedValue([{affectedRows: 1, changedRows: 1}, []])
        const result = await released('i-001')
        const [sql, params] = query.mock.calls[0]
        expect(sql).toMatch(/UPDATE instance SET worker_type = NULL WHERE id = \?/i)
        expect(params).toEqual(['i-001'])
        expect(result).toBe(true)
    })

    test('returns false when id not found', async () => {
        query.mockResolvedValue([{affectedRows: 0, changedRows: 0}, []])
        const result = await released('no-such-id')
        expect(result).toBe(false)
    })

    test('returns false on double-release (row matched but worker_type already NULL)', async () => {
        // affectedRows=1 (CLIENT_FOUND_ROWS), changedRows=0 (no actual change) — must return false.
        query.mockResolvedValue([{affectedRows: 1, changedRows: 0}, []])
        const result = await released('i-001')
        expect(result).toBe(false)
    })
})

describe('terminated', () => {
    test('DELETE FROM instance WHERE id = ?', async () => {
        query.mockResolvedValue([{affectedRows: 1}, []])
        await terminated('i-001')
        const [sql, params] = query.mock.calls[0]
        expect(sql).toMatch(/DELETE FROM instance WHERE id = \?/i)
        expect(params).toEqual(['i-001'])
    })
})

describe('idleInstances', () => {
    test('SELECT id WHERE type = ? AND worker_type IS NULL, returns array of ids', async () => {
        query.mockResolvedValue([[{id: 'i-010'}, {id: 'i-011'}], []])
        const ids = await idleInstances('m4.xlarge')
        const [sql, params] = query.mock.calls[0]
        expect(sql).toMatch(/SELECT id FROM instance WHERE type = \? AND worker_type IS NULL/i)
        expect(params).toEqual(['m4.xlarge'])
        expect(ids).toEqual(['i-010', 'i-011'])
    })

    test('returns empty array when no idle instances exist', async () => {
        query.mockResolvedValue([[], []])
        const ids = await idleInstances('m4.xlarge')
        expect(ids).toEqual([])
    })
})
