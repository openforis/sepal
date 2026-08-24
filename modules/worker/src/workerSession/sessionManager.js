// SessionManager — in-proc session component surface.
//
// Binds each command/query handler to its injected collaborators (repo, instanceManager,
// lockedUsers, clock, apiKeyGenerator, event emitters) so callers invoke a clean
// argument-only surface.
//
// registerInstanceManagerHooks() wires the in-proc instance → session seam:
//   onInstanceActivated(instance)         → activatePendingSessionOnInstance(instance.id)
//   onFailedToProvisionInstance(instance) → closeSessionOnInstance(instance.id)

import {ClientException, NotFoundException} from '#sepal/exception'
import {getLogger} from '#sepal/log'

import {instanceTag} from '../tag.js'
import {activatePendingSessionOnInstance as _activatePendingSessionOnInstance} from './command/activatePendingSessionOnInstance.js'
import {closeSession as _closeSession} from './command/closeSession.js'
import {closeSessionOnInstance as _closeSessionOnInstance} from './command/closeSessionOnInstance.js'
import {closeSessionsWithoutInstance as _closeSessionsWithoutInstance} from './command/closeSessionsWithoutInstance.js'
import {closeTimedOutSessions as _closeTimedOutSessions} from './command/closeTimedOutSessions.js'
import {closeUserSessions as _closeUserSessions} from './command/closeUserSessions.js'
import {expireSessions as _expireSessions} from './command/expireSessions.js'
import {extendSession as _extendSession} from './command/extendSession.js'
import {heartbeat as _heartbeat} from './command/heartbeat.js'
import {releaseUnusedInstances as _releaseUnusedInstances} from './command/releaseUnusedInstances.js'
import {requestSession as _requestSession} from './command/requestSession.js'
import {setSessionTimeout as _setSessionTimeout} from './command/setSessionTimeout.js'
import {emitSessionAppAssociated, emitSessionAppDissociated, emitSessionChanged, emitSessionExpiryClosed, emitSessionExpiryNotified, emitWorkerSessionActivated, emitWorkerSessionClosed, emitWorkerSessionRequested} from './events.js'
import {allOpenSessions as _allOpenSessions} from './query/allOpenSessions.js'
import {findPendingOrActiveSession as _findPendingOrActiveSession} from './query/findPendingOrActiveSession.js'
import {findSessionById as _findSessionById} from './query/findSessionById.js'
import {findUsernameByApiKey as _findUsernameByApiKey} from './query/findUsernameByApiKey.js'
import {generateUserSessionReport as _generateUserSessionReport} from './query/generateUserSessionReport.js'
import {generateUserUsageReport as _generateUserUsageReport} from './query/generateUserUsageReport.js'
import {mostRecentlyClosedSession as _mostRecentlyClosedSession} from './query/mostRecentlyClosedSession.js'
import {mostRecentlyClosedSessionByUser as _mostRecentlyClosedSessionByUser} from './query/mostRecentlyClosedSessionByUser.js'
import {userWorkerSessions as _userWorkerSessions} from './query/userWorkerSessions.js'
import {createApiKeyGenerator, State, withApiKey} from './workerSession.js'

const log = getLogger('worker/sessionManager')

// createSessionManager({repo, appRepo, instanceManager, lockedUsers, clock?, apiKeyGenerator?, events?})
//   repo             — workerSessionRepository
//   appRepo          — sessionAppRepository: app ↔ session associations
//                       (associateApp/userAppSessions) and the report's apps enrichment.
//   instanceManager  — requestInstance/releaseInstance/…
//   budgetClient     — the budget module's live over-budget verdict (../budgetClient.js);
//                       requestSession's authoritative gate. Optional: without it (or when the
//                       call fails) requestSession falls back to lockedUsers.
//   lockedUsers      — the event-fed locked-users gate (../lockedUsers.js); the fallback gate for
//                       requestSession, and the sink for the budget.UserBudget* events.
//   usageRepo        — instanceUsage repository; the session report enriches each session with
//                       its latest resource-usage sample (optional — the report works without it).
//   expiryPolicy     — the session-expiration settings (mode + every extension magnitude); the
//                       single source for how far each event moves a deadline.
//   instanceTypeById — instance types by id, for the expiry emails.
//   sendEmail        — outbound-email shim (../email.js); injectable so tests can assert sends.
//   extendUrl        — session → the tokenised extend link in the expiry email.
//   expiryMetrics    — {wouldHaveClosed(session)}; the notify-mode counter worth watching during
//                       rollout. Optional.
//   terminals        — the sampler's live terminal-session count per session
//                       (../instanceUsage/terminalRegistry.js), so an expiry notification can say
//                       what is running. Optional; absent reads as zero.
//   verdicts         — the sampler's latest busy verdict per session
//                       (../instanceUsage/busyRegistry.js); the report labels each session with it.
//                       Optional; absent reads as 'unknown'.
//   clock            — () => Date (defaults to () => new Date())
//   apiKeyGenerator  — { generate() } (defaults to createApiKeyGenerator())
//   events           — { emitWorkerSessionActivated, emitWorkerSessionClosed } (defaults to the
//                       real event emitters; injectable so tests can assert emissions)
const createSessionManager = ({
    repo,
    appRepo,
    instanceManager,
    budgetClient = null,
    lockedUsers,
    usageRepo,
    expiryPolicy,
    terminals = null,
    verdicts = null,
    instanceTypeById = {},
    sendEmail = () => {},
    extendUrl = () => null,
    expiryMetrics = null,
    clock = () => new Date(),
    apiKeyGenerator = createApiKeyGenerator(),
    events: {
        emitWorkerSessionRequested: emitRequested = emitWorkerSessionRequested,
        emitWorkerSessionActivated: emitActivated = emitWorkerSessionActivated,
        emitWorkerSessionClosed: emitClosed = emitWorkerSessionClosed,
        emitSessionAppAssociated: emitAppAssociated = emitSessionAppAssociated,
        emitSessionAppDissociated: emitAppDissociated = emitSessionAppDissociated,
        emitSessionChanged: emitChanged = emitSessionChanged,
        emitSessionExpiryNotified: emitExpiryNotified = emitSessionExpiryNotified,
        emitSessionExpiryClosed: emitExpiryClosed = emitSessionExpiryClosed,
    } = {},
}) => {
    // ── collaborator bundles (matched to each handler's needs) ────────────────
    const closeDeps = {repo, instanceManager, emitWorkerSessionClosed: emitClosed}

    // ── commands ──────────────────────────────────────────────────────────────
    // A requested session is a new PENDING row in the user's report. WorkerSessionRequested opens
    // budget's instance-use row, so a session closed before it ever activates is still billed from
    // its creationTime; emitChanged additionally signals the report change so other tabs see the
    // STARTING session immediately.
    const requestSession = async command => {
        const session = await _requestSession(command, {
            repo, budgetClient, lockedUsers, instanceManager, clock, apiKeyGenerator,
            startupLeaseMinutes: expiryPolicy.startupLeaseMinutes,
        })
        // Strip the apiKey — the event is serialised to RabbitMQ.
        emitRequested({username: session.username, session: withApiKey(session, null)})
        emitChanged({username: session?.username})
        return session
    }

    const closeSession = command => _closeSession(command, closeDeps)

    const activatePendingSessionOnInstance = instanceId =>
        _activatePendingSessionOnInstance(instanceId, {
            repo,
            startupLeaseMinutes: expiryPolicy.startupLeaseMinutes,
            emitWorkerSessionActivated: emitActivated,
        })

    const closeSessionOnInstance = instanceId => _closeSessionOnInstance(instanceId, closeDeps)

    const closeUserSessions = username => _closeUserSessions(username, closeDeps)

    // options: {startTime, startupGraceMs} — the caller's startup grace (see the command).
    const closeTimedOutSessions = (options = {}) =>
        _closeTimedOutSessions({...closeDeps, ...options, clock})

    // tracker — the caller's cross-sweep memory (../missingInstanceTracker.js); it is what decides
    // whether a probe verdict has earned a close.
    const closeSessionsWithoutInstance = tracker =>
        _closeSessionsWithoutInstance({...closeDeps, tracker})

    const releaseUnusedInstances = (minAge, timeUnit) =>
        _releaseUnusedInstances(minAge, timeUnit, {repo, instanceManager})

    // Sweep the shared local daemon for worker containers no open session (and no
    // provider-tracked instance) claims — see instanceManager.removeOrphanedContainers.
    const removeOrphanedContainers = async () => {
        const openSessions = await repo.sessions([State.PENDING, State.ACTIVE])
        return instanceManager.removeOrphanedContainers(openSessions)
    }

    const heartbeat = command => _heartbeat(command, {
        repo, interactionExtensionMinutes: expiryPolicy.interactionExtensionMinutes,
    })

    // ── the ratchet, in every flavour ─────────────────────────────────────────
    // Each of these reaches the SAME single UPDATE. They differ only in magnitude, in whether they
    // re-anchor the unattended cap, and in whether the deadline they move is reported back — the
    // one-shot senders need to know their extension landed, the recurring ones do not.
    const extendSession = async command => {
        const {username, extended} = await _extendSession(command, {repo})
        if (extended) {
            emitChanged({username})
        }
        return extended
    }

    // The Usage-panel keep-alive slider. REPLACES the deadline rather than ratcheting it, so it
    // can shorten a session as well as lengthen it — the cursor shows the current keep-alive, and
    // moving it means "make it this much". Every other path here is a ratchet.
    const setSessionTimeoutHours = async ({sessionId, hours, username}) => {
        const {username: owner, applied} = await _setSessionTimeout({
            sessionId, username, minutes: Math.round(Math.max(0, Number(hours)) * 60),
        }, {repo})
        if (applied) {
            emitChanged({username: owner})
        }
        return applied
    }

    // App or terminal opened — a one-shot event with no successor to re-assert it.
    const openExtension = ({sessionId, username}) =>
        extendSession({
            sessionId, username, minutes: expiryPolicy.openExtensionMinutes,
            interaction: true, reason: 'opened',
        })

    // The in-app Extend button.
    const manualExtension = ({sessionId, username}) =>
        extendSession({
            sessionId, username, minutes: expiryPolicy.manualExtensionMinutes,
            interaction: true, reason: 'extend-button',
        })

    // Task progress. Expressed as a ratchet rather than only as the sweep's task filter: a session
    // that is notified, then runs a three-hour task, then leaves task protection would otherwise
    // face a notified_time three hours old and close on the next sweep — a warning issued three
    // hours before the user could act on it. As a ratchet, leaving protection always starts a
    // fresh cycle. It does NOT stamp last_interaction_time: a task is not a human.
    const taskExtension = sessionId =>
        repo.extendSession({
            sessionId, minutes: expiryPolicy.taskExtensionMinutes,
            interaction: false, reason: 'task-progress',
        })

    // Dismiss suppresses the email and nothing else — the session still closes at T+grace.
    const dismissExpiryNotification = async ({sessionId, username}) => {
        const dismissed = await repo.dismissNotification(sessionId, username)
        if (dismissed) {
            emitChanged({username})
        }
        return dismissed
    }

    // The email link's extension, guarded on the notified_time its token was signed against so two
    // concurrent clicks redeem it once.
    const redeemExtension = async ({sessionId, notifiedTime}) => {
        const session = await repo.getSession(sessionId).catch(() => null)
        const redeemed = await repo.redeemExtension({
            sessionId, notifiedTime, minutes: expiryPolicy.emailExtensionMinutes,
        })
        if (redeemed) {
            emitChanged({username: session?.username})
        }
        return redeemed
    }

    // options: {startTime, startupGraceMs} — the caller's startup grace (see the command).
    const expireSessions = (options = {}) =>
        _expireSessions({
            repo,
            appRepo,
            terminals,
            mode: expiryPolicy.mode,
            policy: expiryPolicy,
            instanceTypeById,
            sendEmail,
            extendUrl,
            releaseInstance: instanceId => instanceManager.releaseInstance(instanceId),
            emitSessionExpiryNotified: emitExpiryNotified,
            emitSessionExpiryClosed: emitExpiryClosed,
            emitWorkerSessionClosed: emitClosed,
            emitSessionChanged: emitChanged,
            metrics: expiryMetrics,
            clock,
            ...options,
        })

    // ── queries ─────────────────────────────────────────────────────────────
    const userWorkerSessions = query => _userWorkerSessions(query, {repo})
    const findSessionById = sessionId => _findSessionById(sessionId, {repo})
    const findPendingOrActiveSession = query => _findPendingOrActiveSession(query, {repo})
    const generateUserSessionReport = query =>
        _generateUserSessionReport(query, {repo, appRepo, instanceManager, usageRepo, terminals, verdicts})
    const generateUserUsageReport = query =>
        _generateUserUsageReport(query, {usageRepo, instanceManager, clock})
    const findUsernameByApiKey = apiKey => _findUsernameByApiKey(apiKey, {repo})
    const allOpenSessions = () => _allOpenSessions(null, {repo})

    // ── app ↔ session association ─────────────────────────────────────────────
    // Permanence is enforced HERE: if the app already has a live association on any open
    // session, that association wins — no upsert, the caller gets the existing one back and
    // must adopt it. The winning association's OWNER is refreshed to the requesting client
    // though: the requester shows the tab now, and a reconnect re-assert must transfer
    // ownership off the old clientId before its pending clientDown sweeps it.
    //
    // reassert — this is that ws-reconnect ownership refresh and NOT somebody opening an app, so
    // it reaches no ratchet. The association is machine-replayed for every open tab whenever the
    // socket drops; counting it as an interaction re-anchored the unattended cap on a browser
    // event no human caused, which is the same mistake as counting a proxied request.
    const associateApp = async ({username, sessionId, appPath, label, clientId, reassert = false}) => {
        let session
        try {
            session = await repo.getSession(sessionId)
        } catch (_error) {
            throw new NotFoundException(`Non-existing session: ${sessionId}`)
        }
        if (session.state !== State.PENDING && session.state !== State.ACTIVE) {
            throw new NotFoundException(`Session not open: ${sessionId}`)
        }
        if (username && session.username !== username) {
            throw new ClientException(`Session not owned by user: ${sessionId}`, {
                statusCode: 403,
                userMessage: {message: 'Session not owned by user', key: 'error.forbidden'}
            })
        }
        const existing = (await appRepo.userAppSessions(session.username))
            .find(({path}) => path === appPath)
        if (existing) {
            if (clientId) {
                await appRepo.setClient({username: session.username, appPath, clientId})
            }
            // Opening an app IS an interaction — including re-opening one whose association
            // already exists. The extension rides the association rather than needing its own
            // round-trip from the gateway; terminals reach the same ratchet through
            // POST /sessions/session/:id/opened, since ssh-gateway associates nothing.
            if (!reassert) {
                await openExtension({sessionId: existing.sessionId, username: session.username})
            }
            return {sessionId: existing.sessionId, path: existing.path, label: existing.label}
        }
        await appRepo.associate({username: session.username, appPath, sessionId, label, clientId})
        if (!reassert) {
            await openExtension({sessionId, username: session.username})
        }
        emitAppAssociated({username: session.username, sessionId, path: appPath, label})
        return {sessionId, path: appPath, label}
    }

    const userAppSessions = username => appRepo.userAppSessions(username)

    // dissociateApp — unbind an app from its session (GUI tab close, or a takeover
    // dissociating another client's binding). Only the association is removed: the session
    // stays open and the app process keeps running on its instance. Frees the (username,
    // appPath) slot so the app can be re-opened on another instance.
    // Idempotent: no association → no-op, no event. The event carries the deleted row's
    // OWNER and the requesting client, so the gateway can close the owner's tab when
    // someone else dissociated it.
    const dissociateApp = async ({username, appPath, requestingClientId}) => {
        const deleted = await appRepo.dissociate({username, appPath})
        if (deleted) {
            emitAppDissociated({
                username, sessionId: deleted.sessionId, path: appPath,
                clientId: deleted.clientId, requestingClientId
            })
        }
        return Boolean(deleted)
    }

    // dissociateAppsForClient — clientDown: the client's tabs died with it, so every app
    // it owned is dissociated, exactly as if each tab had been closed. Requester = the
    // downed client itself, so no takeover notification is produced.
    const dissociateAppsForClient = async ({username, clientId}) => {
        if (!username || !clientId) {
            return []
        }
        const deleted = await appRepo.dissociateForClient({username, clientId})
        for (const {appPath, sessionId} of deleted) {
            emitAppDissociated({
                username, sessionId, path: appPath,
                clientId, requestingClientId: clientId
            })
        }
        return deleted
    }

    // getDefaultInstanceType — the first tagged instance type.
    const getDefaultInstanceType = () => instanceManager.getInstanceTypes().find(t => t.tag)
    const mostRecentlyClosedSessionByUser = () => _mostRecentlyClosedSessionByUser({repo})
    const mostRecentlyClosedSession = username => _mostRecentlyClosedSession(username, {repo})

    // ── in-proc instance → session wiring ─────────────────────────────────────
    const registerInstanceManagerHooks = () => {
        instanceManager.onInstanceActivated(instance => {
            activatePendingSessionOnInstance(instance.id).catch(error =>
                log.error(`Failed to activate pending session on ${instanceTag(instance)}`, error)
            )
        })
        instanceManager.onFailedToProvisionInstance(instance => {
            closeSessionOnInstance(instance.id).catch(error =>
                log.error(`Failed to close session on ${instanceTag(instance)}`, error)
            )
        })
    }

    return {
        // commands
        requestSession,
        closeSession,
        activatePendingSessionOnInstance,
        closeSessionOnInstance,
        closeUserSessions,
        closeTimedOutSessions,
        closeSessionsWithoutInstance,
        releaseUnusedInstances,
        removeOrphanedContainers,
        heartbeat,
        extendSession,
        setSessionTimeoutHours,
        openExtension,
        manualExtension,
        taskExtension,
        dismissExpiryNotification,
        redeemExtension,
        expireSessions,
        // queries
        userWorkerSessions,
        findSessionById,
        findPendingOrActiveSession,
        generateUserSessionReport,
        generateUserUsageReport,
        findUsernameByApiKey,
        allOpenSessions,
        getDefaultInstanceType,
        mostRecentlyClosedSessionByUser,
        mostRecentlyClosedSession,
        // app ↔ session association
        associateApp,
        dissociateApp,
        dissociateAppsForClient,
        userAppSessions,
        // wiring
        registerInstanceManagerHooks,
    }
}

export {createSessionManager}
