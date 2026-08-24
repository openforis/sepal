import {useEffect} from 'react'
import {filter} from 'rxjs'

import {clientId$, event$} from '~/api/ws'
import api from '~/apiRegistry'
import {appList} from '~/apps'
import {getLogger} from '~/log'
import {select, subscribe} from '~/store'
import {msg} from '~/translate'
import {Notifications} from '~/widget/notifications'
import {closeTab} from '~/widget/tabs/tabActions'

const log = getLogger('appSessionMonitor')

// Headless monitor: closes app tabs whose worker session (instance) has closed.
// Primary signal: the pushed 'workerSessionClosed' websocket event (gateway).
// Self-correction: every user-report poll (10s) closes tabs whose sessionId was
// PREVIOUSLY SEEN in a report and is now gone — covers events missed while offline.
// Also handles client-scoped app ownership: 'appSessionDissociated' (another browser
// took the app over) closes the local tab, and a ws reconnect (new clientId) re-asserts
// the open tabs' associations released by the old clientId's clientDown.
// The seen-then-gone invariant is essential: a tab is stamped with its sessionId on
// the FIRST start response (even STARTING), BEFORE that session appears in the polled
// report, and the store subscription fires on every dispatch (including the stamping
// one) with the stale report — so a tab whose session we have never seen in a report
// must NOT be closed, or every fresh instance start would self-destruct instantly.

export const closeTabsForSession = (sessionId, tabs, close = closeTab) => {
    if (!sessionId) {
        return // undefined/missing sessionId must never match sessionId-less tabs (landing/docker)
    }
    ;(tabs || [])
        .filter(tab => tab.sessionId === sessionId)
        .forEach(tab => close(tab.id, 'apps'))
}

// Close tabs whose session was seen in an EARLIER report and is now absent. `seenSessionIds`
// carries the running set of every session id ever reported; the current report's ids are added
// to it after the sweep. `sessions` undefined → do nothing (report not loaded — no information).
export const closeTabsForClosedSessions = (sessions, tabs, seenSessionIds, close = closeTab) => {
    if (!sessions) {
        return // report not loaded yet — no information
    }
    const currentIds = new Set(sessions.map(({id}) => id))
    ;(tabs || [])
        .filter(tab => tab.sessionId && seenSessionIds.has(tab.sessionId) && !currentIds.has(tab.sessionId))
        .forEach(tab => close(tab.id, 'apps'))
    currentIds.forEach(id => seenSessionIds.add(id))
}

const notifyDissociated = app =>
    Notifications.warning({message: msg('apps.sessionTakenOver', {app}), timeout: 8})

// Another client dissociated this client's app (takeover: the app was opened from another
// browser window). Close our tab WITHOUT the Tabs onClose hook, so no release request is
// fired against the new owner's fresh binding, and tell the user why the tab vanished.
export const closeTabsForDissociatedApp = (appPath, tabs, close = closeTab, notify = notifyDissociated) => {
    if (!appPath) {
        return
    }
    const dissociated = (tabs || []).filter(tab => tab.path === appPath)
    dissociated.forEach(tab => close(tab.id, 'apps'))
    if (dissociated.length) {
        notify(dissociated[0].title || appPath)
    }
}

// Re-assert on reconnect: a ws drop fires clientDown for the OLD clientId, and the worker
// then releases this client's app associations even though its tabs are still open. When
// the connection comes back (new clientId), re-request each open app tab's session — the
// tab's sessionId pins it back to the same instance, and the request carries the new
// clientId (the worker refreshes ownership even when the association still exists, so a
// NOT-yet-swept old clientId is disarmed too). Fire-and-forget, like the tab-close release.
// The FIRST clientId of the SPA instance is only recorded: nothing was released before it.
// Flagged `reassert` so the worker refreshes ownership WITHOUT ratcheting the deadline: this
// replay is caused by the socket dropping, not by anyone opening an app, and counting it re-armed
// every forgotten tab on each reconnect.
export const createSessionReassert = (requestSession$ = (...args) => api.apps.requestSession$(...args), apps = appList) => {
    let currentClientId
    return (clientId, tabs) => {
        const reconnected = currentClientId && clientId !== currentClientId
        currentClientId = clientId
        if (!reconnected) {
            return
        }
        ;(tabs || [])
            .filter(({path, sessionId}) => path && sessionId)
            .forEach(({path, sessionId}) => {
                const {endpoint, label} = apps().find(app => app.path === path) || {}
                requestSession$({endpoint, appPath: path, appLabel: label, sessionId, reassert: true}).subscribe({
                    error: error => log.warn(`Failed to re-assert app session for ${path}`, error)
                })
            })
    }
}

// Stateful report sweep (one per component mount): keeps the seen-session set and the last report
// reference. The store subscription fires on EVERY dispatch; if the report array reference is
// unchanged there is nothing new to sweep, so we return early (avoids sweeping on every dispatch).
export const createReportSweep = (close = closeTab) => {
    const seenSessionIds = new Set()
    let lastSessions
    return (sessions, tabs) => {
        if (sessions === lastSessions) {
            return // same report reference — an unrelated dispatch, nothing new
        }
        lastSessions = sessions
        closeTabsForClosedSessions(sessions, tabs, seenSessionIds, close)
    }
}

export const AppSessionMonitor = () => {
    useEffect(() => {
        const sweepReport = createReportSweep()
        const eventSubscription = event$.pipe(
            filter(({type}) => type === 'workerSessionClosed')
        ).subscribe(
            ({data: {sessionId} = {}}) => closeTabsForSession(sessionId, select('apps.tabs'))
        )
        const dissociatedSubscription = event$.pipe(
            filter(({type}) => type === 'appSessionDissociated')
        ).subscribe(
            ({data: {appPath} = {}}) => closeTabsForDissociatedApp(appPath, select('apps.tabs'))
        )
        const reassert = createSessionReassert()
        const clientIdSubscription = clientId$.subscribe(
            clientId => reassert(clientId, select('apps.tabs'))
        )
        const reportUnsubscribe = subscribe('user.currentUserReport.sessions',
            sessions => sweepReport(sessions, select('apps.tabs'))
        )
        return () => {
            eventSubscription.unsubscribe()
            dissociatedSubscription.unsubscribe()
            clientIdSubscription.unsubscribe()
            reportUnsubscribe()
        }
    }, [])
    return null
}
