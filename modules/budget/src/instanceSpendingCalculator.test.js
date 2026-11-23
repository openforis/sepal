import assert from 'node:assert/strict'
import {describe, test} from 'node:test'

import {instanceUse} from './dto.js'
import {calculate, instanceSpending} from './instanceSpendingCalculator.js'

const COST = {t1: 2, t2: 10}
const d = iso => new Date(iso)

describe('instanceSpendingCalculator.calculate — July 2026 (year 2026, month 7)', () => {
    test('single use fully in-month → elapsed hours × cost', () => {
        const uses = [instanceUse({instanceType: 't1', from: d('2026-07-10T00:00:00Z'), to: d('2026-07-10T02:00:00Z')})]
        assert.equal(calculate(2026, 7, uses, COST), 4)
    })

    test('charges the extra minute proportionally after two hours', () => {
        const uses = [instanceUse({instanceType: 't1', from: d('2026-07-10T00:00:00Z'), to: d('2026-07-10T02:01:00Z')})]
        assert.equal(calculate(2026, 7, uses, COST), 121 / 30)
    })

    test('two ninety-minute sessions cost three hours in total', () => {
        const uses = [
            instanceUse({instanceType: 't1', from: d('2026-07-10T00:00:00Z'), to: d('2026-07-10T01:30:00Z')}),
            instanceUse({instanceType: 't1', from: d('2026-07-11T00:00:00Z'), to: d('2026-07-11T01:30:00Z')}),
        ]
        assert.equal(calculate(2026, 7, uses, COST), 6)
    })

    test('a one-minute session costs one sixtieth of the hourly rate', () => {
        const uses = [instanceUse({instanceType: 't1', from: d('2026-07-10T00:00:00Z'), to: d('2026-07-10T00:01:00Z')})]

        assert.equal(calculate(2026, 7, uses, {t1: 3}), 0.05)
    })

    test('adds sub-minute costs without rounding each session to cents', () => {
        const uses = [
            instanceUse({instanceType: 't1', from: d('2026-07-10T00:00:00Z'), to: d('2026-07-10T00:00:30Z')}),
            instanceUse({instanceType: 't1', from: d('2026-07-11T00:00:00Z'), to: d('2026-07-11T00:00:30Z')}),
        ]

        assert.equal(calculate(2026, 7, uses, {t1: 3}), 0.05)
    })

    test('splits a short session at the month boundary without rounding either part', () => {
        const uses = [instanceUse({instanceType: 't1', from: d('2026-06-30T23:59:30Z'), to: d('2026-07-01T00:00:30Z')})]

        assert.equal(calculate(2026, 6, uses, {t1: 3}), 0.025)
        assert.equal(calculate(2026, 7, uses, {t1: 3}), 0.025)
    })

    test('a zero-duration session costs nothing', () => {
        const instant = d('2026-07-10T00:00:00Z')

        assert.equal(calculate(2026, 7, [instanceUse({instanceType: 't1', from: instant, to: instant})], COST), 0)
    })

    test('use spanning the month boundary → clamped to [firstOfMonth, endOfMonth]', () => {
        const uses = [instanceUse({instanceType: 't1', from: d('2026-06-25T00:00:00Z'), to: d('2026-07-05T00:00:00Z')})]
        assert.equal(calculate(2026, 7, uses, COST), 96 * 2)
    })

    test('use spanning past end of month → to clamped to endOfMonth (Aug 1)', () => {
        const uses = [instanceUse({instanceType: 't1', from: d('2026-07-31T12:00:00Z'), to: d('2026-08-02T00:00:00Z')})]
        assert.equal(calculate(2026, 7, uses, COST), 12 * 2)
    })

    test('use entirely in a prior month → from > to guard → 0', () => {
        const uses = [instanceUse({instanceType: 't1', from: d('2026-06-01T00:00:00Z'), to: d('2026-06-10T00:00:00Z')})]
        assert.equal(calculate(2026, 7, uses, COST), 0)
    })

    test('multiple uses of different types are summed', () => {
        const uses = [
            instanceUse({instanceType: 't1', from: d('2026-07-10T00:00:00Z'), to: d('2026-07-10T02:00:00Z')}), // 2h×2=4
            instanceUse({instanceType: 't2', from: d('2026-07-11T00:00:00Z'), to: d('2026-07-11T03:00:00Z')}), // 3h×10=30
        ]
        assert.equal(calculate(2026, 7, uses, COST), 34)
    })

    test('unknown instanceType → 0 cost (?? 0)', () => {
        const uses = [instanceUse({instanceType: 'unknown', from: d('2026-07-10T00:00:00Z'), to: d('2026-07-10T05:00:00Z')})]
        assert.equal(calculate(2026, 7, uses, COST), 0)
    })

    test('empty list → 0', () => {
        assert.equal(calculate(2026, 7, [], COST), 0)
    })

    test('December wraps to next-year January for endOfMonth', () => {
        const uses = [instanceUse({instanceType: 't1', from: d('2026-12-31T12:00:00Z'), to: d('2027-01-02T00:00:00Z')})]
        assert.equal(calculate(2026, 12, uses, COST), 12 * 2)
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
        assert.deepEqual(captured, {username: 'alice', year: 2026, month: 7})
        assert.equal(spending, 4)
    })
})
