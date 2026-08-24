// RequestSession:
//   1. budget check — throws the matching typed error when the user is over budget. The
//      authoritative answer comes from the budget module LIVE (budgetClient.check), so a restart
//      or a lost event cannot let an over-budget user through; the event-fed lockedUsers set
//      (../../lockedUsers.js) is only the fallback for when budget is unreachable.
//   2. sanitize username → lowercase
//   3. apiKey = workerType === SANDBOX ? apiKeyGenerator.generate() : null
//   4. build PENDING session (id=UUID, creationTime=updateTime=now)
//   5. instance = instanceManager.requestInstance(session) → set instance {id, host}
//   6. repo.insert(requestedSession)
//   7. return requestedSession
//
// api-key race: the row is INSERTED after requestInstance returns. The provisioner's later
// apiKeyForInstance lookup polls because the InstanceProvisioned event may fire before this
// insert commits — keep the ordering (request instance → insert); do NOT insert first.

import crypto from 'crypto'

import {getLogger} from '#sepal/log'

import {instanceTag, sessionTag, userTag} from '../../tag.js'
import {SANDBOX} from '../../workerInstance/workerTypes.js'
import {budgetErrorFor} from '../budgetErrors.js'
import {createWorkerSession, State, withInstance} from '../workerSession.js'

const log = getLogger('worker/requestSession')

// budgetVerdict — the live verdict from the budget module, falling back to the event-fed
// locked-users set when budget is unreachable (or not wired at all).
//
// The fallback deliberately DEGRADES rather than blocks: budget being down must not stop everyone
// in SEPAL from starting a session. Users already known to be over budget are still refused,
// because lockedUsers holds the last verdicts the enforcement cycle published.
const budgetVerdict = async (username, {budgetClient, lockedUsers}) => {
    if (budgetClient) {
        try {
            return await budgetClient.check(username)
        } catch (error) {
            log.warn(`Budget check failed for ${userTag(username)}; falling back to the locked-users set`, error)
        }
    }
    return {
        exceeded: lockedUsers?.isLocked(username) === true,
        reason: 'INSTANCE_BUDGET',
    }
}

const requestSession = async (
    {username, workerType, instanceType},
    {repo, budgetClient, lockedUsers, instanceManager, clock, apiKeyGenerator, startupLeaseMinutes}
) => {
    const {exceeded, reason} = await budgetVerdict(username, {budgetClient, lockedUsers})
    if (exceeded) throw budgetErrorFor(reason, username)
    const sanitizedUsername = username ? username.toLowerCase() : username
    const now = clock()
    const apiKey = workerType === SANDBOX ? apiKeyGenerator.generate() : null
    const session = createWorkerSession({
        id: crypto.randomUUID(),
        state: State.PENDING,
        username: sanitizedUsername,
        workerType,
        instanceType,
        creationTime: now,
        updateTime: now,
        // The startup lease. It is re-ratcheted from active_time on activation, so a slow
        // provision does not eat into it; until then the PENDING 10-minute rule governs anyway.
        timeoutTime: new Date(now.getTime() + startupLeaseMinutes * 60_000),
        apiKey,
    })
    const instance = await instanceManager.requestInstance(session)
    const requestedSession = withInstance(session, instance)
    await repo.insert(requestedSession)
    log.info(`Requested ${sessionTag(requestedSession)} (${workerType}) on ${instanceTag(instance)}`)
    return requestedSession
}

export {requestSession}
