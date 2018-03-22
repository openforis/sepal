import React from 'react'
import {connect, select} from 'store'
import Http from 'http-client'
import actionBuilder from 'action-builder'
import styles from './apps.module.css'
import {msg} from 'translate'
import Icon from 'widget/icon'
import rstudioIcon from './r-studio.png'
import Rx from 'rxjs'

const mapStateToProps = () => ({
    apps: select('apps.list'),
    runningApps: select('apps.running')
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
    return Http.post$(url)
        .takeWhile((e) => e.response.status === 'STARTING')
        .switchMap(() => Rx.Observable.interval(1000)
            // .map((secondsPassed) => {
            //     if (secondsPassed > 30) throw new Error('Timed out')
            //     else return secondsPassed
            // })
            .switchMap((secondsPassed) => secondsPassed < 30
                ? Rx.Observable.of(secondsPassed)
                : Rx.Observable.throw({message: msg('')}))
            .exhaustMap(() => Http.get$(url))
            .takeWhile((e) => e.response.status === 'STARTING')
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
            .onComplete(() =>
                actionBuilder('SHOW_APP')
                    .push(['apps', 'running'], app)
                    .build()
            )
            .dispatch()
    }

    render() {
        if (this.props.runningApps && this.props.runningApps.length) {
            const app = this.props.runningApps[0]
            return (
                <iframe src={`/sandbox/${app.path}`} title={app.label}/>
            )
        }

        const {apps, action} = this.props
        if (!action('LOAD_APPS').dispatched)
            return <div>Spinner</div>

        const dataVis = {path: '/data-vis', label: msg('apps.dataVis'), icon: 'map-o', endpoint: 'geo-web-viz'}
        const rStudio = {path: '/rstudio', image: rstudioIcon, alt: 'RStudio', endpoint: 'rstudio'}
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
        {app.label}
    </button>

const Image = ({src, alt}) => {
    if (!src)
        return null
    else
        return <img src={src} alt={alt}/>
}