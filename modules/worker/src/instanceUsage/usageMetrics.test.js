import {createUsageMetrics} from './usageMetrics.js'

const fakeGauge = () => {
    const calls = {set: [], remove: []}
    return {
        calls,
        set: (labels, value) => calls.set.push({labels, value}),
        remove: labels => calls.remove.push(labels),
    }
}

describe('usageMetrics', () => {
    it('sets one gauge per metric with instance labels, skipping null values', () => {
        const gauges = []
        const gaugeFactory = options => {
            const gauge = fakeGauge()
            gauge.name = options.name
            gauges.push(gauge)
            return gauge
        }
        const metrics = createUsageMetrics({gaugeFactory})
        metrics.update([{
            instanceId: 'i-1', username: 'alice', instanceType: 'T3aSmall',
            cpuPct: 12, ramPct: 50, gpuPct: null, netRxBytesPerS: 100, netTxBytesPerS: 200,
        }])
        const byName = Object.fromEntries(gauges.map(gauge => [gauge.name, gauge]))
        const labels = {username: 'alice', instance_type: 'T3aSmall', instance_id: 'i-1'}
        expect(byName.sepal_instance_cpu_pct.calls.set).toEqual([{labels, value: 12}])
        expect(byName.sepal_instance_ram_pct.calls.set).toEqual([{labels, value: 50}])
        expect(byName.sepal_instance_gpu_pct.calls.set).toEqual([])
        expect(byName.sepal_instance_net_rx_bytes_per_s.calls.set).toEqual([{labels, value: 100}])
    })

    it('removes label sets for instances that disappeared', () => {
        const gauges = []
        const gaugeFactory = options => {
            const gauge = fakeGauge()
            gauge.name = options.name
            gauges.push(gauge)
            return gauge
        }
        const metrics = createUsageMetrics({gaugeFactory})
        const sample = id => ({
            instanceId: id, username: 'alice', instanceType: 'T3aSmall',
            cpuPct: 1, ramPct: 1, gpuPct: null, netRxBytesPerS: 0, netTxBytesPerS: 0,
        })
        metrics.update([sample('i-1'), sample('i-2')])
        metrics.update([sample('i-1')])
        for (const gauge of gauges) {
            expect(gauge.calls.remove).toEqual([
                {username: 'alice', instance_type: 'T3aSmall', instance_id: 'i-2'},
            ])
        }
    })
})
