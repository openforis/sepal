import actionBuilder from 'action-builder'
import rstudioIcon from 'app/home/body/appLaunchPad/r-studio.png'
import Http from 'http-client'
import Rx from 'rxjs'
import {history, isPathInLocation} from 'route'
import {select} from 'store'
import {msg} from 'translate'
import Notifications from 'app/notifications'

export const appList = () =>
    select('apps.list') || []

export const requestedApps = () =>
    appsInState(['REQUESTED', 'INITIALIZED', 'READY'])

export const appState = (path) =>
    select(['apps', 'state', path]).state

export const appReady = (app) => {
    return actionBuilder('APP_READY')
        .set(['apps', 'state', app.path], {state: 'READY', app})
        .dispatch()
}

export const loadApps$ = () =>
    Http.get$('/apps')
        .map((e) => e.response)
        .catch(() => {
            Notifications.error('apps.loading').dispatch()
            return Rx.Observable.of([])
        })
        .map((apps) => {
            const dataVis = {
                path: '/sandbox/data-vis',
                label: msg('apps.dataVis'),
                icon: 'map-o',
                endpoint: 'geo-web-viz'
            }
            const rStudio = {
                path: '/sandbox/rstudio', 
                image: rstudioIcon, 
                alt: 'RStudio', 
                endpoint: 'rstudio'
            }
            return actionBuilder('SET_APPS')
                .set('apps.list', [dataVis, rStudio, ...apps])
                .build()
        })

export const runApp$ = (path) => {
    const app = getApp(path)
    actionBuilder('APP_REQUESTED')
        .pushIfMissing('apps.active', path)
        .set(['apps', 'state', path], {state: 'REQUESTED', app})
        .dispatch()

    const url = `/sandbox/start?endpoint=${app.endpoint ? app.endpoint : 'shiny'}`
    const isSessionStarted = (e) => e.response.status === 'STARTED'

    const requestSession$ = Http.post$(url)
        .filter(isSessionStarted)

    const waitForSession$ = Rx.Observable.interval(1000)
        .switchMap((secondsPassed) => secondsPassed < 30
            ? Rx.Observable.of(secondsPassed)
            : Rx.Observable.throw({message: msg('')}))
        .exhaustMap(() => Http.get$(url))
        .filter(isSessionStarted)
        .first()

    return requestSession$
        .concat(waitForSession$)
        .first()
        .takeUntil(quitApp$.filter((path) => path === app.path))
        .map(() => actionBuilder('APP_INITIALIZED', {app})
            .set(['apps', 'state', app.path], {state: 'INITIALIZED', app})
            .build()
        ).catch(() => {
            quitApp(app.path)
            Notifications.error('apps.run', {label: app.label || app.alt}).dispatch()
            return Rx.Observable.empty()
        })
}

export const quitApp = (path) => {
    quitApp$.next(path)
    isPathInLocation('/app' + path) 
        && history().replace('/app-launch-pad').dispatch()
    actionBuilder('QUIT_APP', {path})
        .del(['apps', 'state', path])
        .delValue(['apps', 'active'], path)
        .dispatch()
}

const quitApp$ = new Rx.Subject()

const getApp = (path) =>
    appList().find((app) => app.path === path)

const appsInState = (states) => (select('apps.active') || [])
    .map((path) => select(['apps', 'state', path]))
    .filter(({state}) => states.includes(state))
    .map(({app}) => app)
