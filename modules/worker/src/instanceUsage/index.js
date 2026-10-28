// Resource-usage monitoring component.
//
// Schedulers (fixed-delay, immediate first run — same pattern as workerSession/index.js):
//   @samplingIntervalSeconds (default 60s): SampleInstances
//   @1h:  RollupUsage (2-hour heal window — a worker restart cannot lose an hour)
//   @24h: PruneUsage (raw samples: sampleRetentionDays; hourly rollups: hourlyRetentionDays)
//
// DO NOT auto-start on import. main.js calls start() explicitly.

import {getLogger} from '#sepal/log'

import {createScheduler} from '../scheduler.js'
import {DAY_MS, HOUR_MS} from '../time.js'
import {sampleInstances} from './sampleInstances.js'
import {createUsageMetrics} from './usageMetrics.js'

const log = getLogger('worker/instanceUsage')

const ROLLUP_HEAL_HOURS = 2

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

    const scheduler = createScheduler(log)

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
        scheduler.schedule('SampleInstances', sample, samplingIntervalSeconds * 1000)
        scheduler.schedule('RollupUsage', rollup, HOUR_MS)
        scheduler.schedule('PruneUsage', prune, DAY_MS)
        log.info(`Started (sampling every ${samplingIntervalSeconds}s)`)
    }

    const stop = () => {
        log.debug('Stopping...')
        scheduler.stopAll()
        log.info('Stopped')
    }

    return {start, stop}
}

export {createInstanceUsageComponent}
