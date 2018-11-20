import {EMPTY, Subject, interval, of, throwError} from 'rxjs'
import {catchError, concat, exhaustMap, filter, first, map, switchMap, takeUntil} from 'rxjs/operators'
import {history, isPathInLocation} from 'route'
import {msg} from 'translate'
import {select} from 'store'
import Notifications from 'app/notifications'
import actionBuilder from 'action-builder'
import api from 'api'
import jupyterIcon from 'app/home/body/appLaunchPad/jupyter.png'
import rstudioIcon from 'app/home/body/appLaunchPad/r-studio.png'

export const appList = () =>
    select('apps.list') || []

export const requestedApps = () =>
    appsInState(['REQUESTED', 'INITIALIZED', 'READY'])

export const appState = path =>
    select(['apps', 'state', path]).state

export const appReady = app => {
    return actionBuilder('APP_READY')
        .set(['apps', 'state', app.path], {state: 'READY', app})
        .dispatch()
}

export const loadApps$ = () =>
    api.apps.loadAll$().pipe(
        catchError(() => {
            Notifications.error('apps.loading').dispatch()
            return of([])
        }),
        map(apps => {
            const dataVis = {
                path: '/sandbox/data-vis',
                label: msg('apps.dataVis'),
                icon: 'map',
                endpoint: 'geo-web-viz'
            }
            const rStudio = {
                path: '/sandbox/rstudio/',
                image: rstudioIcon,
                alt: 'RStudio',
                endpoint: 'rstudio'
            }
            const jupyter = {
                path: '/sandbox/jupyter/tree',
                image: jupyterIcon,
                alt: 'Jupyter notebook',
                endpoint: 'jupyter',
                style: {
                    height: '90%',
                    width: '90%',
                    objectFit: 'contain'
                }
            }
            return actionBuilder('SET_APPS')
                .set('apps.list', [dataVis, rStudio, jupyter, ...apps])
                .build()
        })
    )

export const runApp$ = path => {
    const app = getApp(path)
    actionBuilder('APP_REQUESTED')
        .pushIfMissing('apps.active', path)
        .set(['apps', 'state', path], {state: 'REQUESTED', app})
        .dispatch()

    const isSessionStarted = e => e.response.status === 'STARTED'
    const requestSession$ = api.apps.requestSession$(app.endpoint).pipe(
        filter(isSessionStarted)
    )

    const waitForSession$ = interval(1000).pipe(
        exhaustMap(() => api.apps.waitForSession$(app.endpoint)),
        filter(isSessionStarted),
        first()
    )

    return requestSession$.pipe(
        concat(waitForSession$),
        first(),
        takeUntil(quitApp$.pipe(
            filter(path => path === app.path)
        )),
        map(() => actionBuilder('APP_INITIALIZED', {app})
            .set(['apps', 'state', app.path], {state: 'INITIALIZED', app})
            .build()
        ),
        catchError(() => {
            quitApp(app.path)
            Notifications.error('apps.run', {label: app.label || app.alt}).dispatch()
            return EMPTY
        })
    )
}

export const quitApp = path => {
    quitApp$.next(path)
    isPathInLocation('/app' + path)
    && history().replace('/app-launch-pad').dispatch()
    actionBuilder('QUIT_APP', {path})
        .del(['apps', 'state', path])
        .delValue(['apps', 'active'], path)
        .dispatch()
}

const quitApp$ = new Subject()

const getApp = path =>
    appList().find(app => app.path === path)

const appsInState = states => (select('apps.active') || [])
    .map(path => select(['apps', 'state', path]))
    .filter(({state}) => states.includes(state))
    .map(({app}) => app)
