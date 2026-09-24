// workerInstance/index.js — module-internal wiring:
//   1. provider.onInstanceLaunched → if reserved → emit InstancePendingProvisioning
//   2. in-proc InstancePendingProvisioning → run provisionInstance
//   3. start(): call provider.start(), restore the open sessions' instances into the provider,
//              backfill claims for pre-existing reserved instances, schedule SizeIdlePool +
//              provider.sweep every 1 min (unconditionally — see start())
//   4. stop():  clear scheduler, call provider.stop()
//
// DO NOT auto-start on import. main.js calls start() explicitly.

import {getLogger} from '#sepal/log'

import {createScheduler} from '../scheduler.js'
import {instanceTag} from '../tag.js'
import {MINUTE_MS} from '../time.js'
import {provisionInstance} from './command/provisionInstance.js'
import {sizeIdlePool} from './command/sizeIdlePool.js'
import {
    emitInstancePendingProvisioning,
    instanceEvents,
    WORKER_INSTANCE_PUBLISHERS,
} from './events.js'
import {createInstanceManager} from './instanceManager.js'
import {createProvisioningRegistry} from './provisioningRegistry.js'
import {isReserved} from './workerInstance.js'

const log = getLogger('worker/workerInstance')

const SIZE_IDLE_POOL_INTERVAL_MS = MINUTE_MS

// A provider that keeps its world in memory (local dev) forgets every live instance when the
// worker restarts. The open sessions are the durable record of what was allocated, so hand them
// back before anything reads the provider — backfillClaims included, since it rebuilds the claim
// table from provider.reservedInstances(). Providers whose hosting service is authoritative
// (AWS) implement restore as a no-op.
//
// A failure here degrades to the behaviour that shipped before restore existed, so it is logged
// rather than fatal.
const restoreOpenSessionInstances = async ({provider, openSessionInstances}) => {
    if (!provider.restore || !openSessionInstances) {
        return
    }
    try {
        await provider.restore(await openSessionInstances())
    } catch (err) {
        log.error('Failed to restore instances from the open sessions:', err.message)
    }
}

// A reserved instance with no claim row has nobody to tear it down: ReleaseUnusedInstances tags
// it idle and its container keeps running. Re-claiming it here puts it back under
// ReclaimStaleClaims, which routes an abandoned claim through the full release.
//
// Claims go missing two ways, and both are permanent rather than migration-era: a session that
// predates the claim table, and launchInstance's claim INSERT failing (it logs rather than
// throwing, so as not to strand a running machine). This is reconciliation, not a shim.
//
// A claim written here for a session that has since closed is not a leak: ReclaimStaleClaims drops
// it once the grace period passes.
const backfillClaims = async ({claims, provider}) => {
    const reserved = await provider.reservedInstances()
    let backfilled = 0
    for (const instance of reserved) {
        const sessionId = instance.reservation?.sessionId
        if (sessionId && await claims.claim(instance.id, sessionId)) {
            backfilled++
        }
    }
    if (backfilled > 0) {
        log.info(`Backfilled ${backfilled} claim(s) for sessions predating the claim table`)
    }
}

// stoppedPoolSize — target size of the type-agnostic pool of stopped, disk-warm instances (AWS).
const createWorkerInstanceComponent = ({claims, provider, provisioner, instanceTypes, openSessionInstances = null, stoppedPoolSize = 0}) => {

    // ONE registry shared by both provisioning paths — the event handler below and the
    // reconcile sweep reaching in through instanceManager.reprovisionInstance. Two registries
    // would let them re-enter each other, which is the whole thing being prevented.
    const provisioning = createProvisioningRegistry()

    // ── Wire: provider.onInstanceLaunched ─────────────────────────────────────
    // If the launched instance is reserved → emit InstancePendingProvisioning
    // (which triggers provisionInstance below)
    provider.onInstanceLaunched(instance => {
        if (isReserved(instance)) {
            log.debug(`Reserved ${instanceTag(instance)} -> pending provisioning`)
            emitInstancePendingProvisioning(instance)
        } else {
            log.debug(`Idle ${instanceTag(instance)} - no provisioning`)
        }
    })

    // ── Wire: in-proc InstancePendingProvisioning → provisionInstance ─────────
    instanceEvents.on('InstancePendingProvisioning', instance => {
        log.debug(`Starting provisioning for ${instanceTag(instance)}`)
        provisioning.run(instance.id, instance.reservation?.sessionId, () => provisionInstance(instance, {provisioner}))
            .then(ran => ran || log.debug(`Already provisioning ${instanceTag(instance)} - ignored`))
            .catch(err => {
                // provisionInstance already emits FailedToProvisionInstance; just log here
                log.error(`Failed to provision ${instanceTag(instance)}: ${err.message}`)
            })
    })

    const targetIdleCountByInstanceType = new Map(
        instanceTypes
            .filter(t => (t.idleCount ?? 0) > 0)
            .map(t => [t.id, t.idleCount])
    )

    const scheduler = createScheduler(log)

    const start = async () => {
        log.debug('Starting...')
        await provider.start()

        await restoreOpenSessionInstances({provider, openSessionInstances})

        try {
            await backfillClaims({claims, provider})
        } catch (err) {
            log.error('Claim backfill failed:', err.message)
        }

        // Scheduled UNCONDITIONALLY, even with no idle pool configured. SizeIdlePool is the only
        // step that terminates, or stops into the pool, a released instance — releaseInstance
        // merely un-reserves it (on AWS, re-tags it State=idle), and the provider's own cleanup
        // sweeps only idle instances of an OLDER version. An empty target map is not "nothing to
        // do": every idle instance then has target 0 and is terminated, which is exactly what should
        // happen. Gating on `size > 0` made the whole termination path hinge on one catalog entry
        // carrying idleCount.
        const targets = [...targetIdleCountByInstanceType.keys()].join(', ') || 'none (all idle instances are surplus)'
        log.debug(`Scheduling SizeIdlePool every ${SIZE_IDLE_POOL_INTERVAL_MS}ms for types: ${targets}`)
        // SizeIdlePool is the only step that terminates, or pools, a released instance —
        // releaseInstance merely un-reserves it. The provider sweep then collects what no
        // allocation path can see: instances of an older version, and untagged instances whose
        // CreateTags never ran. A sweep failure must not stop the sizing, hence the two
        // independent catches.
        const runPoolCycle = async () => {
            try {
                await sizeIdlePool(targetIdleCountByInstanceType, stoppedPoolSize, {provider, claims})
            } catch (err) {
                log.error('SizeIdlePool failed:', err.message)
            }
            try {
                await provider.sweep()
            } catch (err) {
                log.error('Provider sweep failed:', err.message)
            }
        }
        scheduler.schedule('SizeIdlePool', runPoolCycle, SIZE_IDLE_POOL_INTERVAL_MS)

        log.info('Started')
    }

    const stop = async () => {
        log.debug('Stopping...')
        scheduler.stopAll()
        await provider.stop()
        log.info('Stopped')
    }

    const instanceManager = createInstanceManager({claims, provider, provisioner, instanceTypes, provisioning})

    return {
        instanceManager,
        start,
        stop,
        WORKER_INSTANCE_PUBLISHERS,
    }
}

export {createWorkerInstanceComponent}
