// ExpireSessions — the single sweep over stored deadlines (docs/session-expiration-model.md §5).
//
//   T+0                             notification_state NONE → NOTIFIED; ws push → in-app
//                                   notification with [Keep it running] [Terminate now]
//   T+notificationVisibleMinutes    still NOTIFIED → email with one manage link → EMAILED
//   T+graceMinutes                  NOTIFIED | DISMISSED | EMAILED → close (mode=enforce), or
//                                   count a would-have-closed and restart the cycle (mode=notify)
//
// Dismiss means only "I saw it, don't email me" — the session still closes at T+grace, because an
// easy misclick must not destroy a session. Any extension event, at any point, cancels the whole
// thing: the ratchet resets notification_state in the same statement (§5b rule 1), so a user who
// simply goes back to typing is rescued silently and never has to touch the notification.
//
// The sweep may never act on a fact it read earlier: every transition is a compare-and-set guarded
// on what was observed, so exactly one sweep sees each transition even if a sweep overruns its
// minute, and an interaction landing between candidate selection and the close leaves the session
// open (the guarded close changes zero rows).
//
// STARTUP GRACE: a stored deadline survives a worker outage, but the SENDERS of extension events
// cannot reach a down worker, so they need wall-clock time to re-assert. As before this suppresses
// the sweep rather than shifting deadlines. Measured from process start, so a worker crash-looping
// faster than the grace reaches no sweep and closes nothing — see §8, that gap is not fixed here.
//
// Per-item try/catch: a failed notification never blocks the close, a failed close never blocks the
// next session.

import {getLogger} from '#sepal/log'

import {instanceName} from '../../instanceName.js'
import {sessionTag} from '../../tag.js'
import {sessionOrdinals} from '../query/sessionOrdinals.js'
import {NotificationState, withApiKey} from '../workerSession.js'

const log = getLogger('worker/expireSessions')

const MINUTE_MS = 60_000

const MODE = Object.freeze({
    OFF: 'off',
    NOTIFY: 'notify',
    ENFORCE: 'enforce',
})

// runningText — "Jupyter and RStudio", or null when no app is running. The same list the GUI
// notification shows, so a user reading the mail and a user looking at the browser see the instance
// described identically.
//
// Terminal sessions are deliberately excluded: a count of open ptys names nothing a user can act
// on, and an idle shell in a forgotten tab counts the same as a running build. They are still
// sampled — that is what feeds the busy verdict and the interaction signal.
const runningText = ({apps = []}) => {
    const parts = apps.map(({label, path}) => label || path)
    if (!parts.length) {
        return null
    }
    return parts.length === 1
        ? parts[0]
        : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

// instanceText — "Instance <b>crazy-banana</b> (t3a.small, $0.02/h)". The name is derived from the
// session id (instanceName.js) and is the same one the GUI, the management page and the SSH menu
// show, so every interface names the machine identically. The price is what makes "keep it
// running" a real decision rather than a reflex. The ordinal is not printed here: it is what a
// user TYPES in the SSH menu, not what they read.
const instanceText = ({name, instanceType}) => {
    const parts = [
        instanceType?.name,
        instanceType?.hourlyCost ? `$${instanceType.hourlyCost.toFixed(2)}/h` : null,
    ].filter(Boolean)
    const suffix = parts.length ? ` (${parts.join(', ')})` : ''
    return name
        ? `Instance <b>${name}</b>${suffix}`
        : `One of your instances${suffix}`
}

// manageLink — ONE link, to a page carrying both choices. Deliberately not two links: a mail is
// read on a phone, and a destructive action one tap from the inbox is a mis-tap waiting to happen.
// Omitted when the deployment has no SEPAL_ENDPOINT to build an absolute URL from — the mail still
// goes out, and using the instance rescues it just as well as the link would have.
const manageLink = url =>
    url
        ? `<a href="${url}">Keep it running or terminate it</a>
        <br><br>`
        : ''

const expiryEmail = ({instanceType, policy, url, running, name}) => ({
    subject: 'Your SEPAL instance is about to be stopped',
    content: `
        ${instanceText({name, instanceType})} has not been used for a while, and
        will be <b>stopped in about ${policy.graceMinutes} minutes</b> unless you keep it.
        ${running ? `<br><br><b>${running}</b> ${running.includes(' and ') ? 'are' : 'is'} running on it.` : ''}
        <br><br>
        ${manageLink(url)}
        Simply using the instance — typing in a notebook, an app or a terminal — keeps it running
        too, and no action is needed.
        <br><br>
        Your files are untouched either way: everything in your home directory is preserved, and
        you can start a new instance at any time.
    `,
})

const closedEmail = ({instanceType, running, name}) => ({
    subject: 'Your unused SEPAL instance was stopped',
    content: `
        ${instanceText({name, instanceType})} was stopped after going unused, to
        avoid unnecessary cost.
        ${running ? `<br><br>This closed <b>${running}</b>.` : ''}
        <br><br>
        Your files are untouched — everything in your home directory is preserved. You can start a
        new instance at any time.
    `,
})

// describeSessions — what is running on each candidate, and the number the user knows it by
// (see query/sessionOrdinals.js for what that number is an index into).
//
// One query per distinct owner, and only for sessions that have actually expired, so this costs
// nothing on a healthy sweep.
const describeSessions = async (sessions, {repo, appRepo, terminals}) => {
    const descriptions = new Map()
    const appsBySession = appRepo
        ? await appRepo.appsForSessions(sessions.map(({id}) => id))
        : new Map()
    const ordinalsByUser = new Map()
    for (const session of sessions) {
        if (!ordinalsByUser.has(session.username)) {
            ordinalsByUser.set(session.username, await sessionOrdinals(session.username, {repo}))
        }
        descriptions.set(session.id, {
            apps: appsBySession.get(session.id) ?? [],
            terminals: terminals?.get(session.id) ?? 0,
            ordinal: ordinalsByUser.get(session.username).get(session.id) ?? null,
            name: instanceName(session.id),
        })
    }
    return descriptions
}

const expireSessions = async ({
    repo,
    appRepo = null,
    terminals = null,
    mode,
    policy,
    instanceTypeById = {},
    sendEmail,
    manageUrl,
    releaseInstance,
    emitSessionExpiryNotified,
    emitSessionExpiryClosed,
    emitWorkerSessionClosed,
    emitSessionChanged,
    metrics = null,
    startTime = null,
    startupGraceMs = 0,
    clock = () => new Date(),
}) => {
    if (mode === MODE.OFF) {
        return null
    }
    if (startTime && clock().getTime() - startTime.getTime() < startupGraceMs) {
        log.info('Within the startup grace period - skipping the session expiry sweep')
        return null
    }
    const sessions = await repo.expiredSessions()
    if (!sessions.length) {
        return null
    }
    const descriptions = await describeSessions(sessions, {repo, appRepo, terminals})
    const now = clock()
    for (const session of sessions) {
        try {
            const instanceType = instanceTypeById[session.instanceType]
            // What is running is captured HERE, before anything closes: the close cascade deletes
            // the app associations, so a description read afterwards would always say "nothing".
            const running = descriptions.get(session.id) ?? {apps: [], terminals: 0, ordinal: null}
            const state = session.notificationState
            if (state === NotificationState.NONE) {
                if (await repo.notifyExpiry(session.id)) {
                    log.info(`${sessionTag(session)} (${session.instanceType}) expired - notifying`
                        + ` (${runningText(running) ?? 'nothing running'})`)
                    emitSessionExpiryNotified({
                        username: session.username,
                        session: withApiKey(session, null),
                        ...running,
                        typeName: instanceType?.name ?? null,
                        extensionMinutes: policy.manualExtensionMinutes,
                    })
                }
                continue
            }
            if (!session.notifiedTime) {
                continue // NOTIFIED without a timestamp cannot happen; nothing sane to do with it
            }
            const notifiedAgeMs = now.getTime() - new Date(session.notifiedTime).getTime()
            if (notifiedAgeMs >= policy.graceMinutes * MINUTE_MS) {
                if (mode === MODE.ENFORCE) {
                    await close({
                        session, instanceType, running, repo, policy, releaseInstance,
                        emitSessionExpiryClosed, emitWorkerSessionClosed, sendEmail,
                    })
                } else {
                    // notify mode — record what would have happened and start a fresh cycle, so
                    // flipping to enforce closes no backlog on the first sweep. This counter is
                    // the number worth watching during rollout.
                    metrics?.wouldHaveClosed(session)
                    log.info(`${sessionTag(session)} (${session.instanceType}) would have been closed (mode=notify)`)
                    if (await repo.restartExpiryCycle(session.id, session.notifiedTime, policy.graceMinutes)) {
                        emitSessionChanged({username: session.username})
                    }
                }
                continue
            }
            if (state === NotificationState.NOTIFIED
                && notifiedAgeMs >= policy.notificationVisibleMinutes * MINUTE_MS) {
                // The state advances regardless of the send result (logged on failure): a
                // permanently failing address must not turn the sweep into a per-minute retry loop.
                if (await repo.markEmailed(session.id, session.notifiedTime)) {
                    try {
                        sendEmail({
                            username: session.username,
                            ...expiryEmail({
                                instanceType,
                                policy,
                                url: manageUrl(session),
                                running: runningText(running),
                                name: running.name,
                            }),
                        })
                    } catch (error) {
                        log.error(`Failed to send expiry email for ${sessionTag(session)}`, error)
                    }
                }
            }
        } catch (error) {
            log.error(`Expiry evaluation failed for ${sessionTag(session)}`, error)
        }
    }
    return null
}

// close — the two-transaction close, with the row-close guarded on everything the sweep decided on.
// Zero rows changed means something rescued the session in the interval, and no teardown happens.
const close = async ({session, instanceType, running, repo, policy, releaseInstance, emitSessionExpiryClosed, emitWorkerSessionClosed, sendEmail}) => {
    const closed = await repo.closeExpiredSession({
        sessionId: session.id,
        notificationState: session.notificationState,
        notifiedTime: session.notifiedTime,
        graceMinutes: policy.graceMinutes,
    })
    if (!closed) {
        log.debug(() => `${sessionTag(session)} was rescued before the close - leaving it open`)
        return false
    }
    log.info(`${sessionTag(session)} (${session.instanceType}) expired past grace - closed`)
    await releaseInstance(session.instance.id)
    emitWorkerSessionClosed({username: session.username, sessionId: session.id})
    emitSessionExpiryClosed({
        username: session.username,
        sessionId: session.id,
        ...running,
        typeName: instanceType?.name ?? null,
    })
    sendEmail({
        username: session.username,
        ...closedEmail({instanceType, running: runningText(running), name: running.name}),
    })
    return true
}

export {expireSessions, MODE}
