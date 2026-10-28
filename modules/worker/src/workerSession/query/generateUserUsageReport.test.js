import assert from 'node:assert/strict'
import {test} from 'node:test'

import {generateUserUsageReport} from './generateUserUsageReport.js'

const NOW = new Date('2026-08-01T12:00:00Z')

const row = overrides => ({
    instanceType: 'T3aSmall', hours: 2,
    cpuWeight: 90, cpuSum: 1800, cpuMax: 90,
    ramWeight: 90, ramSum: 900, ramMax: 40,
    gpuWeight: 0, gpuSum: 0, gpuMax: null,
    netWeight: 90, netSum: 90_000,
    ...overrides,
})

// rowsByMonth: 'YYYY-MM' → the rollup rows of the month starting then.
const deps = (rowsByMonth = {}) => {
    const calls = []
    return {
        calls,
        deps: {
            usageRepo: {userUsageRollup: async (...args) => {
                calls.push(args)
                return rowsByMonth[args[1].toISOString().slice(0, 7)] ?? []
            }},
            instanceManager: {getInstanceTypes: () => [
                {id: 'T3aSmall', name: 't3a.small', tag: 't1', hourlyCost: 0.0204},
                {id: 'G5Xlarge', name: 'g5.xlarge', tag: 'g1', hourlyCost: 1.123},
            ]},
            clock: () => NOW,
            hourlyRetentionDays: 365,
        },
    }
}

const reportedMonths = report => report.months.map(({month}) => month)

test('reports each UTC calendar month with usage, newest first, the current one so far', async () => {
    const {deps: d} = deps({'2026-08': [row()], '2026-06': [row()], '2025-12': [row()]})
    const report = await generateUserUsageReport({username: 'alice'}, d)
    assert.deepEqual(reportedMonths(report), ['2026-08', '2026-06', '2025-12'])
})

test('reads each month from its first hour up to the next month\'s', async () => {
    const {calls, deps: d} = deps()
    await generateUserUsageReport({username: 'alice'}, d)
    assert.deepEqual(calls[0], ['alice', new Date('2026-08-01T00:00:00Z'), new Date('2026-09-01T00:00:00Z')])
    assert.deepEqual(calls[1], ['alice', new Date('2026-07-01T00:00:00Z'), new Date('2026-08-01T00:00:00Z')])
})

// 365 days back from 2026-08-01T12:00 lands inside 2025-08, which pruning has already cut into.
test('goes back to the oldest month the retention keeps whole', async () => {
    const {calls, deps: d} = deps()
    await generateUserUsageReport({username: 'alice'}, d)
    assert.deepEqual(calls.at(-1)[1], new Date('2025-09-01T00:00:00Z'))
})

test('includes a month the retention starts on exactly', async () => {
    const {calls, deps: d} = deps()
    await generateUserUsageReport({username: 'alice'}, {...d, clock: () => new Date('2026-08-01T00:00:00Z')})
    assert.deepEqual(calls.at(-1)[1], new Date('2025-08-01T00:00:00Z'))
})

test('no usage → no months', async () => {
    const {deps: d} = deps()
    assert.deepEqual(await generateUserUsageReport({username: 'alice'}, d), {months: []})
})

test('per-type rows carry weighted averages and maxima', async () => {
    const {deps: d} = deps({'2026-08': [row()]})
    const [month] = (await generateUserUsageReport({username: 'alice'}, d)).months
    assert.deepEqual(month.byInstanceType, [{
        instanceType: 'T3aSmall', name: 't3a.small', tag: 't1', hours: 2,
        cpu: {avg: 20, max: 90},
        ram: {avg: 10, max: 40},
        gpu: null,
        netBytesPerS: 1000,
        cost: 0.04,
    }])
})

test('overall re-weights across types; gpu present only where measured', async () => {
    const {deps: d} = deps({'2026-08': [
        row(),
        row({instanceType: 'G5Xlarge', hours: 1,
            cpuWeight: 10, cpuSum: 900, cpuMax: 95,
            ramWeight: 10, ramSum: 800, ramMax: 85,
            gpuWeight: 10, gpuSum: 700, gpuMax: 100,
            netWeight: 10, netSum: 10_000}),
    ]})
    const [{overall, byInstanceType}] = (await generateUserUsageReport({username: 'alice'}, d)).months
    assert.equal(overall.hours, 3)
    assert.deepEqual(overall.cpu, {avg: 27, max: 95})     // (1800+900)/100
    assert.deepEqual(overall.ram, {avg: 17, max: 85})     // (900+800)/100
    assert.deepEqual(overall.gpu, {avg: 70, max: 100})    // 700/10 — GPU hours only
    assert.equal(overall.netBytesPerS, 1000)             // (90000+10000)/100
    assert.deepEqual(byInstanceType[1].gpu, {avg: 70, max: 100})
})

test('each type is priced at its hourly rate, and overall sums them', async () => {
    const {deps: d} = deps({'2026-08': [row({hours: 10}), row({instanceType: 'G5Xlarge', hours: 3})]})
    const [month] = (await generateUserUsageReport({username: 'alice'}, d)).months
    assert.deepEqual(month.byInstanceType.map(({cost}) => cost), [0.2, 3.37])
    assert.equal(month.overall.cost, 3.57)
})

test('a retired type has no cost and adds none to overall', async () => {
    const {deps: d} = deps({'2026-08': [row({hours: 10}), row({instanceType: 'Retired9000', hours: 5})]})
    const [month] = (await generateUserUsageReport({username: 'alice'}, d)).months
    assert.equal(month.byInstanceType[1].cost, null)
    assert.equal(month.overall.cost, 0.2)
})

test('unknown instance type falls back to its id as name, with no tag', async () => {
    const {deps: d} = deps({'2026-08': [row({instanceType: 'Retired9000'})]})
    const [month] = (await generateUserUsageReport({username: 'alice'}, d)).months
    assert.equal(month.byInstanceType[0].name, 'Retired9000')
    assert.equal(month.byInstanceType[0].tag, null)
})
