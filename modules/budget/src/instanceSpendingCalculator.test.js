import {instanceUse} from './dto.js'
import {calculate, instanceSpending} from './instanceSpendingCalculator.js'

const COST = {t1: 2, t2: 10}
const d = iso => new Date(iso)

describe('instanceSpendingCalculator.calculate — July 2026 (year 2026, month 7)', () => {
    test('single use fully in-month → ceil(hours) × cost', () => {
        const uses = [instanceUse({instanceType: 't1', from: d('2026-07-10T00:00:00Z'), to: d('2026-07-10T02:00:00Z')})]
        expect(calculate(2026, 7, uses, COST)).toBe(4)
    })

    test('fractional-hour use → CEIL (2h1m → 3)', () => {
        const uses = [instanceUse({instanceType: 't1', from: d('2026-07-10T00:00:00Z'), to: d('2026-07-10T02:01:00Z')})]
        expect(calculate(2026, 7, uses, COST)).toBe(6)
    })

    test('per-record ceil: two 1.5h uses = ceil(1.5)+ceil(1.5)=4h (NOT ceil(3)=3)', () => {
        const uses = [
            instanceUse({instanceType: 't1', from: d('2026-07-10T00:00:00Z'), to: d('2026-07-10T01:30:00Z')}),
            instanceUse({instanceType: 't1', from: d('2026-07-11T00:00:00Z'), to: d('2026-07-11T01:30:00Z')}),
        ]
        expect(calculate(2026, 7, uses, COST)).toBe(8)
    })

    test('use spanning the month boundary → clamped to [firstOfMonth, endOfMonth]', () => {
        const uses = [instanceUse({instanceType: 't1', from: d('2026-06-25T00:00:00Z'), to: d('2026-07-05T00:00:00Z')})]
        expect(calculate(2026, 7, uses, COST)).toBe(96 * 2)
    })

    test('use spanning past end of month → to clamped to endOfMonth (Aug 1)', () => {
        const uses = [instanceUse({instanceType: 't1', from: d('2026-07-31T12:00:00Z'), to: d('2026-08-02T00:00:00Z')})]
        expect(calculate(2026, 7, uses, COST)).toBe(12 * 2)
    })

    test('use entirely in a prior month → from > to guard → 0', () => {
        const uses = [instanceUse({instanceType: 't1', from: d('2026-06-01T00:00:00Z'), to: d('2026-06-10T00:00:00Z')})]
        expect(calculate(2026, 7, uses, COST)).toBe(0)
    })

    test('multiple uses of different types are summed', () => {
        const uses = [
            instanceUse({instanceType: 't1', from: d('2026-07-10T00:00:00Z'), to: d('2026-07-10T02:00:00Z')}), // 2h×2=4
            instanceUse({instanceType: 't2', from: d('2026-07-11T00:00:00Z'), to: d('2026-07-11T03:00:00Z')}), // 3h×10=30
        ]
        expect(calculate(2026, 7, uses, COST)).toBe(34)
    })

    test('unknown instanceType → 0 cost (?? 0)', () => {
        const uses = [instanceUse({instanceType: 'unknown', from: d('2026-07-10T00:00:00Z'), to: d('2026-07-10T05:00:00Z')})]
        expect(calculate(2026, 7, uses, COST)).toBe(0)
    })

    test('empty list → 0', () => {
        expect(calculate(2026, 7, [], COST)).toBe(0)
    })

    test('December wraps to next-year January for endOfMonth', () => {
        const uses = [instanceUse({instanceType: 't1', from: d('2026-12-31T12:00:00Z'), to: d('2027-01-02T00:00:00Z')})]
        expect(calculate(2026, 12, uses, COST)).toBe(12 * 2)
    })
})

describe('instanceSpendingCalculator.instanceSpending — repo + clock wrapper', () => {
    test('derives year/month from clock, pulls uses, delegates to calculate', async () => {
        const now = d('2026-07-15T00:00:00Z')
        const captured = {}
        const repo = {
            userInstanceUses: async (username, year, month) => {
                captured.username = username
                captured.year = year
                captured.month = month
                return [instanceUse({instanceType: 't1', from: d('2026-07-10T00:00:00Z'), to: d('2026-07-10T02:00:00Z')})]
            },
        }
        const spending = await instanceSpending(repo, 'alice', COST, () => now)
        expect(captured).toEqual({username: 'alice', year: 2026, month: 7})
        expect(spending).toBe(4)
    })
})
