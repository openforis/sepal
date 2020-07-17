import {concat, exhaustMap, filter, first, map} from 'rxjs/operators'
import {interval} from 'rxjs'
import {select} from 'store'
import _ from 'lodash'
import actionBuilder from 'action-builder'
import api from 'api'

export const appList = () =>
    select('apps.list') || []

export const loadApps$ = () =>
    api.apps.loadAll$().pipe(
        map(apps => actionBuilder('SET_APPS')
            .set('apps.list', _.orderBy(apps, ['pinned', 'label'], ['desc', 'asc']))
            .dispatch()
        )
    )

export const runApp$ = path => {
    const {endpoint} = appList().find(app => app.path === path)

    const isSessionStarted = e => e.response.status === 'STARTED'

    const requestSession$ = api.apps.requestSession$(endpoint).pipe(
        filter(isSessionStarted)
    )

    const waitForSession$ = interval(1000).pipe(
        exhaustMap(() => api.apps.waitForSession$(endpoint)),
        filter(isSessionStarted),
        first()
    )

    return requestSession$.pipe(
        concat(waitForSession$),
        first()
    )
}
