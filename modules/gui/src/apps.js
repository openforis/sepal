import _ from 'lodash'
import {concat, exhaustMap, filter, first, interval, map} from 'rxjs'

import {actionBuilder} from '~/action-builder'
import api from '~/apiRegistry'
import {select} from '~/store'

export const appList = () =>
    select('apps.list') || []

export const loadApps$ = () =>
    api.apps.loadAll$().pipe(
        map(appsSpec => actionBuilder('SET_APPS')
            .set('apps.list', _.orderBy(appsSpec.apps, ['pinned', 'label'], ['desc', 'asc']))
            .set('apps.tags', _.orderBy(appsSpec.tags, ['label'], ['asc']))
            .dispatch()
        )
    )

export const runApp$ = path => {
    const {endpoint} = appList().find(app => app.path === path)

    const isSessionStarted = e => e.status === 'STARTED'

    const requestSession$ = api.apps.requestSession$(endpoint).pipe(
        filter(e => isSessionStarted(e))
    )

    const waitForSession$ = interval(2000).pipe(
        exhaustMap(() => api.apps.waitForSession$(endpoint)),
        filter(e => isSessionStarted(e)),
        first()
    )

    return concat(requestSession$, waitForSession$).pipe(
        first()
    )
}
