import {getLogger} from '#sepal/log'

import {instanceTag} from '../../tag.js'
import {createWorkerInstance, isIdle, isReserved, release, reserve} from '../../workerInstance/workerInstance.js'

const log = getLogger('worker/local')

// The host used for all locally-provisioned instances.
const LOCAL_HOST = 'host.docker.internal'

const createLocalInstanceProvider = _instanceType => {
    const workerInstanceById = new Map()

    const launchListeners = []

    const updateInstance = instance => {
        if (instance) {
            workerInstanceById.set(instance.id, instance)
        }
    }

    // Listeners fire on the next tick, never synchronously.
    const notifyLaunchListeners = instance => {
        setImmediate(() => {
            for (const listener of launchListeners) {
                try {
                    listener(instance)
                } catch (err) {
                    log.error('Error in launch listener', err)
                }
            }
        })
    }

    const launchReserved = (type, reservation) => {
        log.info(`Launching reserved ${type} instance (reservation: ${JSON.stringify(reservation)})`)
        const id = crypto.randomUUID()
        const instance = reserve(
            createWorkerInstance({
                id,
                type,
                // Per-instance network alias on the shared dev daemon — all local instances
                // live on ONE docker host, so a shared host + username-keyed container name
                // would make concurrent sessions overwrite each other's containers.
                host: id,
                daemonHost: LOCAL_HOST,
                launchTime: new Date(),
                running: true,
            }),
            reservation
        )
        updateInstance(instance)
        notifyLaunchListeners(instance)
        return instance
    }

    // NOTE: count is IGNORED — always launches exactly 1 instance.
    const launchIdle = (type, _count) => {
        log.info(`Launching ${_count} idle ${type} instance(s)`)
        const id = crypto.randomUUID()
        const instance = createWorkerInstance({
            id,
            type,
            host: id, // per-instance network alias — see launchReserved
            daemonHost: LOCAL_HOST,
            launchTime: new Date(),
            running: true,
        })
        updateInstance(instance)
        notifyLaunchListeners(instance)
        return [instance]
    }

    const terminate = instanceId => {
        log.info(`Terminating ${instanceTag(instanceId)}`)
        workerInstanceById.delete(instanceId)
    }

    // The caller already has a new instance object with the reservation set; just persist it.
    const reserveInstance = instance => {
        log.info(`Reserving ${instanceTag(instance)}`)
        updateInstance(instance)
    }

    const releaseInstance = instanceId => {
        log.info(`Releasing ${instanceTag(instanceId)}`)
        const instance = workerInstanceById.get(instanceId)
        if (instance) {
            updateInstance(release(instance))
        }
    }

    // Both forms return idle instances ONLY, and the instanceType argument is ignored.
    // sizeIdlePool relies on "no-arg = all idle" (the AWS provider filters on the State=idle tag):
    // returning reserved instances here makes it terminate them while their session is live.
    const idleInstances = _instanceType =>
        [...workerInstanceById.values()].filter(isIdle)

    const reservedInstances = () =>
        [...workerInstanceById.values()].filter(isReserved)

    const getInstance = instanceId =>
        workerInstanceById.get(instanceId) ?? null

    // restore — adopt instances the worker already knows about, rebuilt from the open sessions,
    // after a restart. This Map is the provider's whole world, so without it every live instance
    // reads as gone: releaseInstance finds nothing to undeploy and reclaimStaleClaims drops live
    // sessions' claims. The AWS provider needs no equivalent — EC2 answers from tags.
    //
    // Existing entries win: anything already in the Map was launched by THIS process and is more
    // current than a row rebuilt from the database. daemonHost is re-pinned because a session row
    // persists only the host alias, and every local instance lives on the one dev daemon.
    const restore = instances => {
        let restored = 0
        for (const instance of instances ?? []) {
            if (instance?.id && !workerInstanceById.has(instance.id)) {
                workerInstanceById.set(instance.id, createWorkerInstance({
                    ...instance,
                    daemonHost: LOCAL_HOST,
                }))
                restored++
            }
        }
        if (restored > 0) {
            log.info(`Restored ${restored} instance(s) from the open sessions`)
        }
    }

    const onInstanceLaunched = listener => {
        launchListeners.push(listener)
    }

    const start = () => { /* no-op */ }

    const stop = () => { /* no-op */ }

    // Local instances are reachable the moment they exist, and the in-memory map has no garbage
    // to collect — both are no-ops here so the two providers satisfy one port.
    const awaitHost = instance => instance

    const sweep = () => { /* no-op */ }

    return {
        launchReserved,
        launchIdle,
        terminate,
        reserve: reserveInstance,
        release: releaseInstance,
        idleInstances,
        reservedInstances,
        getInstance,
        restore,
        awaitHost,
        sweep,
        onInstanceLaunched,
        start,
        stop,
    }
}

export {createLocalInstanceProvider, LOCAL_HOST}
