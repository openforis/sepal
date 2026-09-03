// workerInstance/index.js — module-internal wiring:
//   1. provider.onInstanceLaunched → if reserved → emit InstancePendingProvisioning
//   2. in-proc InstancePendingProvisioning → run provisionInstance
//   3. start(): build targetIdleCountByInstanceType, schedule SizeIdlePool every 1 min
//              (unconditionally — see start()), call provider.start()
//   4. stop():  clear scheduler, call provider.stop()
//
// DO NOT auto-start on import. main.js calls start() explicitly.

import {getLogger} from '#sepal/log'

import {instanceTag} from '../tag.js'
import {provisionInstance} from './command/provisionInstance.js'
import {sizeIdlePool} from './command/sizeIdlePool.js'
import {
    emitInstancePendingProvisioning,
    instanceEvents,
    WORKER_INSTANCE_PUBLISHERS,
} from './events.js'
import {createInstanceManager} from './instanceManager.js'
import {isReserved} from './workerInstance.js'

const log = getLogger('worker/workerInstance')

const SIZE_IDLE_POOL_INTERVAL_MS = 60_000  // 1 minute

const createWorkerInstanceComponent = ({repo, provider, provisioner, instanceTypes}) => {

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
        provisionInstance(instance, {provisioner}).catch(err => {
            // provisionInstance already emits FailedToProvisionInstance; just log here
            log.error(`Failed to provision ${instanceTag(instance)}: ${err.message}`)
        })
    })

    const targetIdleCountByInstanceType = new Map(
        instanceTypes
            .filter(t => (t.idleCount ?? 0) > 0)
            .map(t => [t.id, t.idleCount])
    )

    let sizeIdlePoolTimer = null

    const start = async () => {
        log.debug('Starting...')
        await provider.start()

        // Scheduled UNCONDITIONALLY, even with no idle pool configured. SizeIdlePool is the only
        // step that terminates a released instance — releaseInstance merely un-reserves it (on AWS,
        // re-tags it State=idle), and the provider's own cleanup sweeps only idle instances of an
        // OLDER version. An empty target map is not "nothing to do": every idle instance then has
        // target 0 and is terminated, which is exactly what should happen. Gating on
        // `size > 0` made the whole termination path hinge on one catalog entry carrying idleCount.
        const targets = [...targetIdleCountByInstanceType.keys()].join(', ') || 'none (all idle instances are surplus)'
        log.debug(`Scheduling SizeIdlePool every ${SIZE_IDLE_POOL_INTERVAL_MS}ms for types: ${targets}`)
        const runSizeIdlePool = phase => () =>
            sizeIdlePool(targetIdleCountByInstanceType, {repo, provider}).catch(err =>
                log.error(`SizeIdlePool (${phase}) failed:`, err.message)
            )
        runSizeIdlePool('initial')()
        sizeIdlePoolTimer = setInterval(runSizeIdlePool('scheduled'), SIZE_IDLE_POOL_INTERVAL_MS)

        log.info('Started')
    }

    const stop = async () => {
        log.debug('Stopping...')
        if (sizeIdlePoolTimer !== null) {
            clearInterval(sizeIdlePoolTimer)
            sizeIdlePoolTimer = null
        }
        await provider.stop()
        log.info('Stopped')
    }

    const instanceManager = createInstanceManager({repo, provider, provisioner, instanceTypes})

    return {
        instanceManager,
        start,
        stop,
        WORKER_INSTANCE_PUBLISHERS,
    }
}

export {createWorkerInstanceComponent}
