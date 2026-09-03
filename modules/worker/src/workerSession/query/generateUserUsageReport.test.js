import {generateUserUsageReport} from './generateUserUsageReport.js'

const NOW = new Date('2026-08-01T12:00:00Z')
const DAY_MS = 24 * 3600_000

const row = overrides => ({
    instanceType: 'T3aSmall', hours: 2,
    cpuWeight: 90, cpuSum: 1800, cpuMax: 90,
    ramWeight: 90, ramSum: 900, ramMax: 40,
    gpuWeight: 0, gpuSum: 0, gpuMax: null,
    netWeight: 90, netSum: 90_000,
    ...overrides,
})

const deps = rows => {
    const calls = []
    return {
        calls,
        deps: {
            usageRepo: {userUsageRollup: async (...args) => (calls.push(args), rows)},
            instanceManager: {getInstanceTypes: () => [
                {id: 'T3aSmall', name: 't3a.small'},
                {id: 'G5Xlarge', name: 'g5.xlarge'},
            ]},
            clock: () => NOW,
        },
    }
}

test('window is days back from now; per-type rows carry weighted averages and maxima', async () => {
    const {calls, deps: d} = deps([row()])
    const report = await generateUserUsageReport({username: 'alice', days: 30}, d)
    expect(calls[0]).toEqual(['alice', new Date(NOW.getTime() - 30 * DAY_MS)])
    expect(report.days).toBe(30)
    expect(report.byInstanceType).toEqual([{
        instanceType: 'T3aSmall', name: 't3a.small', hours: 2,
        cpu: {avg: 20, max: 90},
        ram: {avg: 10, max: 40},
        gpu: null,
        netBytesPerS: 1000,
    }])
})

test('overall re-weights across types; gpu present only where measured', async () => {
    const {deps: d} = deps([
        row(),
        row({instanceType: 'G5Xlarge', hours: 1,
            cpuWeight: 10, cpuSum: 900, cpuMax: 95,
            ramWeight: 10, ramSum: 800, ramMax: 85,
            gpuWeight: 10, gpuSum: 700, gpuMax: 100,
            netWeight: 10, netSum: 10_000}),
    ])
    const report = await generateUserUsageReport({username: 'alice', days: 30}, d)
    const {overall} = report
    expect(overall.hours).toBe(3)
    expect(overall.cpu).toEqual({avg: 27, max: 95})     // (1800+900)/100
    expect(overall.ram).toEqual({avg: 17, max: 85})     // (900+800)/100
    expect(overall.gpu).toEqual({avg: 70, max: 100})    // 700/10 — GPU hours only
    expect(overall.netBytesPerS).toBe(1000)             // (90000+10000)/100
    expect(report.byInstanceType[1].gpu).toEqual({avg: 70, max: 100})
})

test('no data → overall null, empty byInstanceType', async () => {
    const {deps: d} = deps([])
    const report = await generateUserUsageReport({username: 'alice', days: 30}, d)
    expect(report).toEqual({days: 30, overall: null, byInstanceType: []})
})

test('unknown instance type falls back to its id as name', async () => {
    const {deps: d} = deps([row({instanceType: 'Retired9000'})])
    const report = await generateUserUsageReport({username: 'alice', days: 30}, d)
    expect(report.byInstanceType[0].name).toBe('Retired9000')
})
