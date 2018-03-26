import React from 'react'
import {connect, select} from 'store'
import {history} from 'route'
import Http from 'http-client'
import actionBuilder from 'action-builder'
import styles from './apps.module.css'
import {msg} from 'translate'
import Icon from 'widget/icon'
import rstudioIcon from './r-studio.png'
import Rx from 'rxjs'

export const runningApps = () => select('apps.running') || []

const mapStateToProps = () => ({
    apps: select('apps.list')
})

function loadApps$() {
    return Http.get$('/apps')
        .map((e) =>
            actionBuilder('SET_APPS')
                .set('apps.list', e.response)
                .build()
        )
}

function requestSandbox$(app) {
    const url = `/sandbox/start?endpoint=${app.endpoint ? app.endpoint : 'shiny'}`
    const isStarting = (e) => e.response.status === 'STARTING'

    return Http.post$(url)
        .takeWhile(isStarting)
        .switchMap(() => Rx.Observable.interval(1000)
            .switchMap((secondsPassed) => secondsPassed < 30
                ? Rx.Observable.of(secondsPassed)
                : Rx.Observable.throw({message: msg('')}))
            .exhaustMap(() => Http.get$(url))
            .takeWhile(isStarting)
        )
}

class Apps extends React.Component {
    componentWillMount() {
        this.props.asyncActionBuilder('LOAD_APPS',
            loadApps$())
            .dispatch()
    }

    openApp(app) {
        this.props.asyncActionBuilder('OPEN_APP',
            requestSandbox$(app))
            .onComplete(() => [
                    history().replace('/app' + app.path),
                    actionBuilder('SET_APP_RUNNING')
                        .pushIfMissing(['apps', 'running'], app, 'path')
                        .build()
                ]
            )
            .dispatch()
    }

    render() {
        const {apps, action} = this.props
        if (!action('LOAD_APPS').dispatched)
            return <div>Spinner</div>

        const dataVis = {path: '/sandbox/data-vis', label: msg('apps.dataVis'), icon: 'map-o', endpoint: 'geo-web-viz'}
        const rStudio = {path: '/sandbox/rstudio', image: rstudioIcon, alt: 'RStudio', endpoint: 'rstudio'}
        const items = [dataVis, rStudio, ...apps].map(
            (app) => <App key={app.path} app={app} onClick={this.openApp.bind(this)}/>
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