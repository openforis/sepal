// Resource-usage monitoring component.
//
// Schedulers (fixed-delay, immediate first run — same pattern as workerSession/index.js):
//   @samplingIntervalSeconds (default 60s): SampleInstances
//   @1h:  RollupUsage (2-hour heal window — a worker restart cannot lose an hour)
//   @24h: PruneUsage (raw samples: sampleRetentionDays; hourly rollups: hourlyRetentionDays)
//
// DO NOT auto-start on import. main.js calls start() explicitly.

import {getLogger} from '#sepal/log'

import {sampleInstances} from './sampleInstances.js'
import {createUsageMetrics} from './usageMetrics.js'

const log = getLogger('worker/instanceUsage')

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
const ROLLUP_HEAL_HOURS = 2

// scheduleFixedDelay — run fn once immediately, then every intervalMs; errors logged,
// never thrown (same local helper as workerSession/index.js).
const scheduleFixedDelay = (name, fn, intervalMs) => {
    const run = () =>
        Promise.resolve()
            .then(fn)
            .catch(error => log.error(`Scheduled job ${name} failed`, error))
    run() // initial delay 0
    return setInterval(run, intervalMs)
}

const createInstanceUsageComponent = ({
    sessionRepo,
    usageRepo,
    stats,
    instanceTypes,
    usageMetrics = createUsageMetrics(),
    samplingIntervalSeconds = 60,
    sampleRetentionDays = 30,
    hourlyRetentionDays = 365,
    expiryPolicy = null,
    terminals = null,
    verdicts = null,
    clock = () => new Date(),
}) => {
    const instanceTypeById = Object.fromEntries(instanceTypes.map(t => [t.id, t]))
    // sessionId → {time, counters, ptyAtime, unknownBusyTicks} — the counter baselines and the
    // per-session cross-tick memory the interaction and coverage-grace rules need.
    const samplerState = new Map()

    let timers = []

    const sample = () =>
        sampleInstances({
            sessionRepo, usageRepo, stats, instanceTypeById, usageMetrics, samplerState,
            terminals, verdicts, policy: expiryPolicy, clock,
        })

    const rollup = () => usageRepo.rollupHours(ROLLUP_HEAL_HOURS)

    const prune = async () => {
        const samples = await usageRepo.pruneSamples(sampleRetentionDays)
        const hourly = await usageRepo.pruneHourly(hourlyRetentionDays)
        log.info(`Pruned usage data: ${samples} samples, ${hourly} hourly rollups`)
    }

    const start = () => {
        log.debug('Starting...')
        timers.push(scheduleFixedDelay('SampleInstances', sample, samplingIntervalSeconds * 1000))
        timers.push(scheduleFixedDelay('RollupUsage', rollup, HOUR_MS))
        timers.push(scheduleFixedDelay('PruneUsage', prune, DAY_MS))
        log.info(`Started (sampling every ${samplingIntervalSeconds}s)`)
    }

    const stop = () => {
        log.debug('Stopping...')
        timers.forEach(clearInterval)
        timers = []
        log.info('Stopped')
    }

    return {start, stop}
}

export {createInstanceUsageComponent}
