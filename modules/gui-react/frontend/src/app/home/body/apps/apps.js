import React from 'react'
import {connect, dispatch, select, state} from 'store'
import {history} from 'route'
import Http from 'http-client'
import actionBuilder from 'action-builder'
import styles from './apps.module.css'
import {msg} from 'translate'
import Icon from 'widget/icon'
import rstudioIcon from './r-studio.png'
import Rx from 'rxjs'
import {CenteredProgress} from 'widget/progress'

const appsInState = (states) => (select('apps.active') || [])
    .map((path) => select(['apps', 'state', path]))
    .filter(({state}) => states.includes(state))
    .map(({app}) => app)

export const requestedApps = () => appsInState(['REQUESTED', 'INITIALIZED', 'READY'])
export const initializedApps = () => appsInState(['INITIALIZED', 'READY'])
export const readyApps = () => appsInState(['READY'])

export const appReady = (app) => {
    console.log('READY: ', app)
    return actionBuilder('APP_READY')
        .set(['apps', 'state', app.path], {state: 'READY', app})
        .dispatch()
}

const mapStateToProps = () => ({
    apps: select('apps.list')
})

function loadApps$() {
    return Http.get$('/apps')
        .map((e) => {
                const dataVis = {
                    path: '/sandbox/data-vis',
                    label: msg('apps.dataVis'),
                    icon: 'map-o',
                    endpoint: 'geo-web-viz'
                }
                const rStudio = {path: '/sandbox/rstudio', image: rstudioIcon, alt: 'RStudio', endpoint: 'rstudio'}
                const apps = [dataVis, rStudio, ...e.response]
                return actionBuilder('SET_APPS')
                    .set('apps.list', apps)
                    .build()
            }
        )
}

function requestSandbox$(app) {
    actionBuilder('APP_REQUESTED')
        .pushIfMissing('apps.active', app.path)
        .set(['apps', 'state', app.path], {state: 'REQUESTED', app})
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
        .map((e) => actionBuilder('APP_INITIALIZED', {app})
            .set(['apps', 'state', app.path], {state: 'INITIALIZED', app})
            .build()
        )
}

class Apps extends React.Component {
    componentWillMount() {
        this.props.asyncActionBuilder('LOAD_APPS',
            loadApps$())
            .dispatch()
    }

    runApp(app) {
        dispatch(history().push('/app' + app.path))
        this.props.asyncActionBuilder('RUN_APP',
            requestSandbox$(app))
            .dispatch()
    }

    render() {
        const {apps, action} = this.props
        if (!action('LOAD_APPS').dispatched)
            return <CenteredProgress title={msg('apps.loading')}/>

        const items = apps.map(
            (app) => <App key={app.path} app={app} onClick={this.runApp.bind(this)}/>
        )
        return (
            <div className={styles.apps}>
                {items}
            </div>
        )
    }
}

export default Apps = connect(mapStateToProps)(Apps)

const App = ({app, onClick}) =>
    <button className={styles.app} onClick={() => onClick(app)}>
        <Image src={app.image}/>
        <Icon name={app.icon} alt={app.alt}/>
        <div>
            <div className={styles.title}>{app.label}</div>
            <div className={styles.description}>{app.description}</div>
        </div>
    </button>

const Image = ({src, alt}) => {
    if (!src)
        return null
    else
        return <img src={src} alt={alt}/>
}