// InstanceManager — the bridge between the workerSession component and the workerInstance
// infrastructure.
//
//   requestInstance(session)                          → Promise<{id, host}>
//   releaseInstance(instanceId)                       → Promise<void>
//   releaseUnusedInstances(sessions, minAge, timeUnit) → Promise<void>
//   removeOrphanedContainers(sessions)                → Promise<string[]>
//   getInstanceTypes()                                → InstanceType[]
//   sessionsWithoutInstance(sessions)                 → Promise<{session, status}[]>
//   onInstanceActivated(callback)                     → void  (fires on InstanceProvisioned)
//   onFailedToProvisionInstance(callback)             → void
//
// requestInstance, onInstanceActivated and onFailedToProvisionInstance all hand the session
// layer a projected {id, host} object; the full domain object stays inside this layer.
//
// Session shape: { instance: { id, host }, workerType, username }
// WorkerInstance shape: { id, type, host, running, launchTime, reservation }

import {getLogger} from '#sepal/log'

import {instanceTag, userTag} from '../tag.js'
import {releaseInstance} from './command/releaseInstance.js'
import {releaseUnusedInstances} from './command/releaseUnusedInstances.js'
import {removeOrphanedContainers} from './command/removeOrphanedContainers.js'
import {requestInstance} from './command/requestInstance.js'
import {instanceEvents} from './events.js'
import {findMissingInstances} from './query/findMissingInstances.js'

const log = getLogger('worker/instanceManager')

const createInstanceManager = ({repo, provider, provisioner, instanceTypes}) => {

    // requestInstance — allocate an instance for a session. Resolves to the {id, host} projection.
    // session: { workerType, instanceType, username }.
    const _requestInstance = async session => {
        const {workerType, instanceType, username, id: sessionId} = session
        log.debug(`Requesting ${instanceType} instance for ${userTag(username)} (${workerType})...`)
        const instance = await requestInstance({workerType, instanceType, username, sessionId}, {repo, provider})
        return {id: instance.id, host: instance.host}
    }

    const _releaseInstance = async instanceId => {
        log.debug(`Releasing ${instanceTag(instanceId)}...`)
        return releaseInstance(instanceId, {repo, provider, provisioner})
    }

    // releaseUnusedInstances — reclaim instances not bound to any active session.
    // sessions: session objects carrying session.instance.id.
    const _releaseUnusedInstances = async (sessions, minAge, timeUnit) => {
        const usedInstanceIds = sessions
            .filter(s => s.instance && s.instance.id)
            .map(s => s.instance.id)
        log.debug(`Releasing unused instances (${usedInstanceIds.length} in use, minAge: ${minAge} ${timeUnit})...`)
        return releaseUnusedInstances(usedInstanceIds, minAge, timeUnit, {repo, provider, provisioner})
    }

    // removeOrphanedContainers — sweep the shared local daemon for worker containers that neither
    // the open sessions nor the provider claim (the in-memory local provider forgets instances on
    // restart, so releaseInstance never undeploys their containers).
    const _removeOrphanedContainers = async sessions => {
        log.debug(`Removing orphaned containers (${sessions.length} open sessions)...`)
        return removeOrphanedContainers(sessions, {provider, provisioner})
    }

    const getInstanceTypes = () => instanceTypes

    // sessionsWithoutInstance — of the given sessions, those whose instance the probe did not
    // CONFIRM, as {session, status}. A session missing from the result was confirmed present.
    // status is MISSING or UNKNOWN; the caller decides what each is worth (see
    // workerSession/missingInstanceTracker.js) — an UNKNOWN must not cost a user their session.
    const sessionsWithoutInstance = async sessions => {
        // Reconstruct full WorkerInstance objects from the session fields — the session only holds
        // the {id, host} projection, but provisioner.instanceStatus needs type and the full
        // reservation: the container name derives from reservation.sessionId.
        const sessionsWithInst = sessions.filter(s => s.instance && s.instance.id)
        const instances = sessionsWithInst.map(s => ({
            id: s.instance.id,
            type: s.instanceType,
            host: s.instance.host,
            reservation: {username: s.username, workerType: s.workerType, sessionId: s.id},
        }))

        if (instances.length === 0) return []

        const missing = await findMissingInstances(instances, {provisioner})
        const statusByInstanceId = new Map(missing.map(({instance, status}) => [instance.id, status]))

        return sessionsWithInst
            .filter(s => statusByInstanceId.has(s.instance.id))
            .map(s => ({session: s, status: statusByInstanceId.get(s.instance.id)}))
    }

    // onInstanceActivated — subscribe to the in-proc InstanceProvisioned event; the callback
    // receives the {id, host} projection.
    const onInstanceActivated = callback => {
        instanceEvents.on('InstanceProvisioned', instance => {
            log.debug(`Activated ${instanceTag(instance)}`)
            callback({id: instance.id, host: instance.host})
        })
    }

    // onFailedToProvisionInstance — subscribe to the in-proc event; the callback receives
    // {id, host} only, with NO error argument.
    const _onFailedToProvisionInstance = callback => {
        instanceEvents.on('FailedToProvisionInstance', instance => {
            log.debug(`Failed to provision ${instanceTag(instance)}`)
            callback({id: instance.id, host: instance.host})
        })
    }

    return {
        requestInstance: _requestInstance,
        releaseInstance: _releaseInstance,
        releaseUnusedInstances: _releaseUnusedInstances,
        removeOrphanedContainers: _removeOrphanedContainers,
        getInstanceTypes,
        sessionsWithoutInstance,
        onInstanceActivated,
        onFailedToProvisionInstance: _onFailedToProvisionInstance,
    }
}

export {createInstanceManager}
