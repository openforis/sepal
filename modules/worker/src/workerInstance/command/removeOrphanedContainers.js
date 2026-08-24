// RemoveOrphanedContainers command handler — no Groovy counterpart. Sweeps the shared local
// daemon for worker containers no live instance claims (see provisioner.removeOrphanedContainers
// for why they leak). The live set is the union of the open sessions' instances (which survive a
// worker restart in the DB while the in-memory local provider forgets them) and every instance
// the provider still tracks (idle pool + reservations mid-provision, which have no session row
// coverage). No-op on dedicated-host hosting (AWS) — the provisioner guards on defaultDaemonHost.

import {getLogger} from '#sepal/log'

const log = getLogger('worker/removeOrphanedContainers')

// sessions — open (PENDING/ACTIVE) sessions, each with session.instance?.id.
// Returns the removed container names.
const removeOrphanedContainers = async (sessions, {provider, provisioner}) => {
    const sessionInstanceIds = sessions
        .filter(s => s.instance && s.instance.id)
        .map(s => s.instance.id)
    const providerInstances = [
        ...await provider.idleInstances(),
        ...await provider.reservedInstances(),
    ]
    const liveInstanceIds = [...new Set([
        ...sessionInstanceIds,
        ...providerInstances.map(i => i.id),
    ])]
    const removed = await provisioner.removeOrphanedContainers(liveInstanceIds)
    if (removed.length) {
        log.info(`Removed ${removed.length} orphaned worker container(s): ${removed.join(', ')}`)
    }
    return removed
}

export {removeOrphanedContainers}
