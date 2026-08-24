// usageMetrics — per-instance Prometheus gauges mirroring the latest usage sample.
// Prometheus is a passive mirror here, never read by decision logic.
//
// createGauge on the main thread lands in prom-client's default global registry, which
// the shared httpServer already serves at GET /metrics — no further wiring needed.
// Label sets for instances absent from a tick are removed so terminated instances
// don't linger as stale series.

import {createGauge} from '#sepal/metrics'

const LABEL_NAMES = ['username', 'instance_type', 'instance_id']

const createUsageMetrics = ({gaugeFactory = createGauge} = {}) => {
    const gauges = {
        cpuPct: gaugeFactory({
            name: 'sepal_instance_cpu_pct',
            help: 'Worker instance CPU usage, percent of the whole instance (interval average)',
            labelNames: LABEL_NAMES,
        }),
        ramPct: gaugeFactory({
            name: 'sepal_instance_ram_pct',
            help: 'Worker instance RAM usage, percent of instance RAM (page cache excluded)',
            labelNames: LABEL_NAMES,
        }),
        gpuPct: gaugeFactory({
            name: 'sepal_instance_gpu_pct',
            help: 'Worker instance GPU utilization, percent averaged across GPUs',
            labelNames: LABEL_NAMES,
        }),
        netRxBytesPerS: gaugeFactory({
            name: 'sepal_instance_net_rx_bytes_per_s',
            help: 'Worker instance network receive rate, bytes per second',
            labelNames: LABEL_NAMES,
        }),
        netTxBytesPerS: gaugeFactory({
            name: 'sepal_instance_net_tx_bytes_per_s',
            help: 'Worker instance network transmit rate, bytes per second',
            labelNames: LABEL_NAMES,
        }),
    }

    // instanceId → labels, for stale-series removal.
    let tracked = new Map()

    const labelsOf = sample => ({
        username: sample.username,
        instance_type: sample.instanceType,
        instance_id: sample.instanceId,
    })

    const update = samples => {
        const current = new Map()
        for (const sample of samples) {
            const labels = labelsOf(sample)
            current.set(sample.instanceId, labels)
            for (const [key, gauge] of Object.entries(gauges)) {
                if (sample[key] != null) {
                    gauge.set(labels, sample[key])
                }
            }
        }
        for (const [instanceId, labels] of tracked) {
            if (!current.has(instanceId)) {
                for (const gauge of Object.values(gauges)) {
                    gauge.remove(labels)
                }
            }
        }
        tracked = current
    }

    return {update}
}

export {createUsageMetrics}
