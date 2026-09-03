import {createInstanceUsageComponent} from './index.js'

const flush = () => new Promise(resolve => setImmediate(resolve))

describe('instanceUsage component', () => {
    it('start() runs an immediate sampling tick; stop() clears the timers', async () => {
        const calls = []
        const component = createInstanceUsageComponent({
            sessionRepo: {sessions: async () => (calls.push('sessions'), [])},
            usageRepo: {
                insertSample: async () => calls.push('insert'),
                rollupHours: async () => calls.push('rollup'),
                pruneSamples: async () => (calls.push('pruneSamples'), 0),
                pruneHourly: async () => (calls.push('pruneHourly'), 0),
            },
            stats: {containerStats: async () => ({}), gpuStats: async () => ''},
            instanceTypes: [{id: 'T3aSmall', cpuCount: 2, ramBytes: 1, gpuCount: 0}],
            usageMetrics: {update: () => calls.push('metrics')},
            samplingIntervalSeconds: 3600, // no second tick during the test
        })
        component.start()
        await flush()
        expect(calls).toContain('sessions')  // sampler ran immediately
        expect(calls).toContain('metrics')
        expect(calls).toContain('rollup')    // rollup job ran immediately
        expect(calls).toContain('pruneSamples')
        expect(calls).toContain('pruneHourly')
        component.stop()
    })
})
