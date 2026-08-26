import {useEffect} from 'react'
import {filter} from 'rxjs'

import {event$} from '~/api/ws'
import api from '~/apiRegistry'
import {usageHint} from '~/app/home/user/usage'
import {runningItems} from '~/app/home/user/userSessionSummary'
import {getLogger} from '~/log'
import {subscribe} from '~/store'
import {msg} from '~/translate'
import {stopCurrentUserSession$} from '~/user'
import {Button} from '~/widget/button'
import {Layout} from '~/widget/layout'
import {Notifications} from '~/widget/notifications'
import {staleWarnings} from '~/widget/sessionExpiryRules'

import styles from './sessionExpiryMonitor.module.css'

const log = getLogger('sessionExpiryMonitor')

const HINT_DURATION_MS = 10_000

// One id per session, so the close notice can REPLACE the warning rather than stack on top of it.
// Same-group notifications are dropped rather than replaced by the notification widget, so the
// replacement is an explicit dismiss followed by a publish.
const warningId = sessionId => `session-expiry-${sessionId}`

// SessionExpiryMonitor — headless: turns the worker's expiry events into the in-app notification
// (docs/session-expiration-model.md §5).
//
// Three outcomes, and the differences matter:
//   Extend        — ratchets the deadline by the minutes the worker grants; the session is saved.
//   Terminate now — closes it immediately, ahead of the grace period.
//   Dismissal     — clicking the notification itself. "I saw it, don't email me", and NOTHING
//                   else; the session still closes at T+grace. Deliberately not read as consent
//                   to close early: an easy misclick must not destroy a session.
//
// None of them is the common rescue. Any normal use of the instance — typing in a notebook, an app
// or a terminal — cancels the whole cycle silently. The buttons exist for the case where the
// machine is wanted but not being touched.
//
// Clicking in the notification is input in the SEPAL shell, not in an app iframe, so it extends
// nothing by itself — which is exactly why Extend has to be an explicit call.

// instanceText — "crazy-banana (t3a.small)". The name is derived from the session id by the
// worker and travels on the event, so the notification, the session list, the expiry email and the
// SSH menu all name the instance identically.
const instanceText = ({name, typeName}) =>
    name
        ? msg('user.userSession.expiry.instance', {name, type: typeName || '?'})
        : msg('user.userSession.expiry.instanceUnnamed')

// What is running, as a bullet list — the same items, ordering and wording as the session list and
// the stop confirmation in the Usage panel, so the three never describe an instance differently.
const runningList = data => {
    const items = runningItems(data)
    return items.length
        ? (
            <ul className={styles.running}>
                {items.map(({key, label}) => <li key={key}>{label}</li>)}
            </ul>
        )
        : null
}

// The warning says the same thing either way — what is running is the bullet list below it, not
// part of the sentence. The close notice still needs both, because there its list is what was lost.
const message = (data, {closed}) => {
    const instance = instanceText(data)
    if (!closed) {
        return msg('user.userSession.expiry.idle', {instance})
    }
    return runningItems(data).length
        ? msg('user.userSession.expiry.runningClosed', {instance})
        : msg('user.userSession.expiry.idleClosed', {instance})
}

// The worker decides how much an Extend buys, so the button quotes it rather than guessing. The
// unlabelled variant covers a worker too old to send the number — better than "Extend  min".
const extendLabel = minutes =>
    minutes
        ? msg('user.userSession.expiry.extend', {minutes})
        : msg('user.userSession.expiry.extendUnknown')

const extendSession = (sessionId, {release, dismiss}) =>
    api.sessions.extendNow$(sessionId).subscribe({
        next: () => {
            release()
            dismiss()
            Notifications.success({message: msg('user.userSession.expiry.extended')})
        },
        // A one-shot with no successor to re-assert it: a button that appears to work while doing
        // nothing is the worst available outcome, so a failure is shown rather than swallowed.
        error: error => {
            log.error('Failed to extend session', error)
            Notifications.error({message: msg('user.userSession.expiry.extendFailed')})
        }
    })

// Optimistic: the warning goes as soon as the request is away, because the session is going too.
// A failure puts an error up rather than restoring a notification whose buttons may no longer mean
// anything.
const terminateSession = (sessionId, {release, dismiss}) => {
    release()
    dismiss()
    stopCurrentUserSession$({id: sessionId}).subscribe({
        error: error => {
            log.error('Failed to stop session', error)
            Notifications.error({message: msg('user.userSession.stop.error'), error})
        }
    })
}

// Both actions `release` the session before dismissing, so their own dismissal is not also
// reported to the worker as "I saw it, don't email me" — only a click on the notification means
// that (see the onDismiss below).
const expiryContent = (data, release) => dismiss => {
    const {sessionId, extensionMinutes} = data
    const running = runningList(data)
    return (
        <Layout type='vertical' spacing='compact'>
            {running
                ? (
                    <div>
                        <div>{msg('user.userSession.expiry.currentlyRunning')}</div>
                        {running}
                    </div>
                )
                : null}
            <Layout type='horizontal' spacing='compact'>
                <Button
                    look='add'
                    shape='pill'
                    label={extendLabel(extensionMinutes)}
                    onClick={() => extendSession(sessionId, {release, dismiss})}
                />
                <Button
                    look='cancel'
                    shape='pill'
                    label={msg('user.userSession.expiry.terminate')}
                    onClick={() => terminateSession(sessionId, {release, dismiss})}
                />
            </Layout>
        </Layout>
    )
}

const dismissExpiry = sessionId =>
    api.sessions.dismissExpiry$(sessionId).subscribe({
        error: error => log.error('Failed to dismiss the expiry notification', error)
    })

export const SessionExpiryMonitor = () => {
    useEffect(() => {
        // The warnings this browser currently has on screen, so the report push knows what to
        // withdraw. Notifications.dismiss on an id that is already gone is a no-op, so a missed
        // entry costs nothing.
        const open = new Set()

        const notifiedSubscription = event$.pipe(
            filter(({type}) => type === 'sessionExpiryNotified')
        ).subscribe(({data = {}}) => {
            const {sessionId} = data
            open.add(sessionId)
            const release = () => open.delete(sessionId)
            Notifications.warning({
                id: warningId(sessionId),
                message: message(data, {closed: false}),
                content: expiryContent(data, release),
                // Clicking the notification dismisses it, and that click is the acknowledgement:
                // it silences the escalation email and changes nothing else. Guarded on `open` so
                // that the withdrawals which are not the user saying "I saw it" — the close
                // notice, the silent rescue, either button's own dismissal — stay silent.
                onDismiss: () => {
                    if (open.delete(sessionId)) {
                        dismissExpiry(sessionId)
                    }
                },
                // No auto-dismiss: this one is worth a decision, and the grace period is an hour.
                timeout: 0
            })
            usageHint(true)
            setTimeout(() => usageHint(false), HINT_DURATION_MS)
        })
        const closedSubscription = event$.pipe(
            filter(({type}) => type === 'sessionExpiryClosed')
        ).subscribe(({data = {}}) => {
            // Replace the warning: its buttons are now meaningless — there is nothing left to
            // extend and nothing left to silence — and leaving them on screen invites a click that
            // can only fail.
            open.delete(data.sessionId)
            Notifications.dismiss(warningId(data.sessionId))
            const running = runningList(data)
            Notifications.info({
                message: message(data, {closed: true}),
                content: running ? () => running : undefined,
                timeout: 0
            })
        })

        // The silent rescue: the user went back to work, the ratchet reset the cycle, and the
        // session report says so on the next push. Withdraw the warning without being asked.
        const unsubscribeStore = subscribe('user.currentUserReport.sessions', sessions =>
            staleWarnings(open, sessions).forEach(sessionId => {
                open.delete(sessionId)
                Notifications.dismiss(warningId(sessionId))
            })
        )

        return () => {
            notifiedSubscription.unsubscribe()
            closedSubscription.unsubscribe()
            unsubscribeStore()
        }
    }, [])
    return null
}
