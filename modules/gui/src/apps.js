import _ from 'lodash'
import {EMPTY, filter, first, map, Observable, of, switchMap, tap, throwError} from 'rxjs'

import {actionBuilder} from '~/action-builder'
import api from '~/apiRegistry'
import {normalizeAppsCatalog} from '~/appsCatalog'
import {select, subscribe} from '~/store'
import {getLanguage} from '~/translate'

export const appList = () =>
    select('apps.list') || []

export const loadApps$ = () =>
    api.apps.loadAll$().pipe(
        map(rawSpec => normalizeAppsCatalog(rawSpec, getLanguage())),
        map(appsSpec => actionBuilder('SET_APPS')
            .set('apps.list', _.orderBy(appsSpec.apps, ['pinned', 'label'], ['desc', 'asc']))
            .set('apps.tags', _.orderBy(appsSpec.tags, ['label'], ['asc']))
            .dispatch()
        )
    )

// The session report is kept fresh by the worker/session websocket (~/widget/sessionMonitor), so
// waiting for a session to start is a store subscription rather than a poll. Emit the current value
// on subscribe so a session that is already running resolves without waiting for a push.
const sessions$ = () => new Observable(subscriber => {
    subscriber.next(select('user.currentUserReport.sessions'))
    return subscribe('user.currentUserReport.sessions', sessions => subscriber.next(sessions))
})

// waitForSession$ — completes once the launched session reports ACTIVE ('STARTING' while its
// instance provisions). A session that appeared in a report and then vanished was closed, which
// means the launch failed: that must surface as an error rather than wait forever. The
// seen-then-gone guard is essential — a session is not in the report until the first push arrives,
// and treating that initial absence as a closure would fail every launch instantly.
const waitForSession$ = sessionId => {
    let seen = false
    return sessions$().pipe(
        map(sessions => (sessions || []).find(({id}) => id === sessionId)),
        switchMap(session => {
            if (session) {
                seen = true
                return of(session)
            }
            return seen
                ? throwError(() => new Error(`Session ${sessionId} closed before it started`))
                : EMPTY
        }),
        filter(({status}) => status === 'ACTIVE'),
        first()
    )
}

export const runApp$ = (path, {sessionId, instanceType, onSession} = {}) => {
    const {endpoint, label} = appList().find(app => app.path === path)

    return api.apps.requestSession$(
        {endpoint, appPath: path, appLabel: label, sessionId, instanceType}
    ).pipe(
        tap(session => onSession && onSession(session)),
        // The start response uses the gateway's status contract ('STARTED'); the report the wait
        // reads uses the worker's ('ACTIVE'). Same state, different vocabulary.
        switchMap(session => session.status === 'STARTED'
            ? of(session)
            : waitForSession$(session.id)),
        first()
    )
}
