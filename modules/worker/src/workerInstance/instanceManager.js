// Bridge session operations to provider-backed instances. Allocation and activation expose {id, host};
// provider state and release coordination remain inside this component.

import {getLogger} from '#sepal/log'

import {instanceTag, userTag} from '../tag.js'
import {provisionInstance} from './command/provisionInstance.js'
import {reclaimStaleClaims} from './command/reclaimStaleClaims.js'
import {releaseInstance} from './command/releaseInstance.js'
import {releaseUnusedInstances} from './command/releaseUnusedInstances.js'
import {removeOrphanedContainers} from './command/removeOrphanedContainers.js'
import {requestInstance} from './command/requestInstance.js'
import {instanceEvents} from './events.js'
import {instanceFromSession} from './instanceFromSession.js'
import {createProvisioningRegistry} from './provisioningRegistry.js'
import {findMissingInstances} from './query/findMissingInstances.js'

const log = getLogger('worker/instanceManager')

const createInstanceManager = ({
    claims,
    provider,
    provisioner,
    instanceTypes,
    provisioning = createProvisioningRegistry(),
}) => {
    // Shared by every release path, so a second release of the same instance joins the first.
    const releasing = new Map()
    const releaseDeps = {claims, provider, provisioner, provisioning, releasing}

    const _requestInstance = async session => {
        const {workerType, instanceType, username, id: sessionId} = session
        log.debug(`Requesting ${instanceType} instance for ${userTag(username)} (${workerType})...`)
        const instance = await requestInstance({workerType, instanceType, username, sessionId}, {claims, provider})
        return {id: instance.id, host: instance.host}
    }

    const _releaseInstance = async (instanceId, sessionId, {retire = false, recoverStartup = false} = {}) => {
        log.debug(`Releasing ${instanceTag(instanceId)}...`)
        return releaseInstance(instanceId, sessionId, {...releaseDeps, retire, recoverStartup})
    }

    const _releaseUnusedInstances = async (sessions, minAge, timeUnit) => {
        const usedInstanceIds = sessions
            .filter(s => s.instance && s.instance.id)
            .map(s => s.instance.id)
        log.debug(`Releasing unused instances (${usedInstanceIds.length} in use, minAge: ${minAge} ${timeUnit})...`)
        return releaseUnusedInstances(usedInstanceIds, minAge, timeUnit, releaseDeps)
    }

    const _reclaimStaleClaims = async (sessions, graceMs) =>
        reclaimStaleClaims(sessions.map(({id}) => id), graceMs, releaseDeps)

    // Sweep the shared daemon for containers outside open sessions and provider tracking.
    const _removeOrphanedContainers = async sessions => {
        log.debug(`Removing orphaned containers (${sessions.length} open sessions)...`)
        return removeOrphanedContainers(sessions, {provider, provisioner})
    }

    const getInstanceTypes = () => instanceTypes

    // Callers must distinguish UNKNOWN probes from confirmed MISSING instances.
    const sessionsWithoutInstance = async sessions => {
        const sessionsWithInst = sessions.filter(s => s.instance && s.instance.id)
        const instances = sessionsWithInst.map(instanceFromSession)

        if (instances.length === 0) return []

        const missing = await findMissingInstances(instances, {provisioner})
        const statusByInstanceId = new Map(missing.map(({instance, status}) => [instance.id, status]))

        return sessionsWithInst
            .filter(s => statusByInstanceId.has(s.instance.id))
            .map(s => ({session: s, status: statusByInstanceId.get(s.instance.id)}))
    }

    const onInstanceActivated = callback => {
        instanceEvents.on('InstanceProvisioned', instance => {
            log.debug(`Activated ${instanceTag(instance)}`)
            callback({id: instance.id, host: instance.host})
        })
    }

    const _onFailedToProvisionInstance = callback => {
        instanceEvents.on('FailedToProvisionInstance', instance => {
            log.debug(`Failed to provision ${instanceTag(instance)}`)
            callback({id: instance.id, host: instance.host})
        })
    }

    // Reconciliation skips instances busy provisioning or releasing.
    const isProvisioning = instanceId => provisioning.isProvisioning(instanceId)

    // Fresh allocation and restart recovery share the same provisioning gate.
    const _reprovisionInstance = session =>
        provisioning.run(session.instance.id, session.id, (isCurrent, progress) =>
            provisionInstance(instanceFromSession(session), {
                claims,
                provider,
                provisioner,
                isCurrent,
                ...progress,
            }))

    return {
        requestInstance: _requestInstance,
        releaseInstance: _releaseInstance,
        releaseUnusedInstances: _releaseUnusedInstances,
        reclaimStaleClaims: _reclaimStaleClaims,
        removeOrphanedContainers: _removeOrphanedContainers,
        getInstanceTypes,
        sessionsWithoutInstance,
        onInstanceActivated,
        onFailedToProvisionInstance: _onFailedToProvisionInstance,
        isProvisioning,
        reprovisionInstance: _reprovisionInstance,
    }
}

export {createInstanceManager}
