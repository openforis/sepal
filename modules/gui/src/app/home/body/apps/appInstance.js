import {ContentPadding} from 'widget/sectionLayout'
import {compose} from 'compose'
import {connect} from 'store'
import {forkJoin, of, timer} from 'rxjs'
import {getLogger} from 'log'
import {msg} from 'translate'
import {publishEvent} from 'eventPublisher'
import {runApp$} from 'apps'
import {withTabContext} from 'widget/tabs/tabContext'
import Notifications from 'widget/notifications'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './appInstance.module.css'

const log = getLogger('apps')

class AppInstance extends React.Component {
    state = {
        appState: 'REQUESTED',
        src: undefined
    }

    render() {
        const {app: {label, alt}} = this.props
        return (
            <ContentPadding
                menuPadding
                className={styles.appInstance}>
                <div className={styles.content}>
                    <div className={styles.backdrop}>
                        {label || alt}
                    </div>
                    <div className={styles.status}>
                        {this.renderStatus()}
                    </div>
                    {this.renderIFrame()}
                </div>
            </ContentPadding>
        )
    }

    renderIFrame() {
        const {app: {label, alt}, stream} = this.props
        const {appState, src} = this.state
        return stream('RUN_APP').completed
            ? (
                <iframe
                    width='100%'
                    height='100%'
                    frameBorder='0'
                    src={src}
                    title={label || alt}
                    style={{border: 'none', display: appState === 'READY' ? 'block' : 'none'}}
                    onLoad={() => this.ready()}
                />
            )
            : null
    }

    renderStatus() {
        const {app} = this.props
        const {appState} = this.state
        return appState === 'REQUESTED'
            ? msg('apps.initializing')
            : appState === 'FAILED'
                ? msg('apps.run.error', {label: app.label || app.alt})
                : msg('apps.loading.progress')
    }

    componentDidMount() {
        const {app: {endpoint, path}, busy$, stream} = this.props
        if (endpoint) {
            this.setState({src: `/api${path}`}, () => {
                busy$.next(true)
                this.runApp()
            })
        } else {
            this.setState({appState: 'INITIALIZED', src: path}, () =>
                stream('RUN_APP', of())
            )
        }
    }

    runApp() {
        const {app, stream} = this.props
        publishEvent('launch_app', {app: app.id})
        stream('RUN_APP',
            forkJoin([
                runApp$(app.path),
                timer(500)
            ]),
            () => this.onInitialized(),
            error => this.onError(error)
        )
    }

    onError(error) {
        const {app, busy$} = this.props
        log.error('Failed to load app', error)
        this.setState({appState: 'FAILED'})
        Notifications.error({message: msg('apps.run.error', {label: app.label || app.alt})})
        busy$.next(false)
    }

    onInitialized() {
        this.setState(({appState}) =>
            appState === 'READY'
                ? null
                : {appState: 'INITIALIZED'}
        )
    }

    ready() {
        const {busy$} = this.props
        busy$.next(false)
        this.setState({appState: 'READY'})
    }
}

AppInstance.propTypes = {
    app: PropTypes.shape({
        alt: PropTypes.string,
        label: PropTypes.string,
        path: PropTypes.string
    })
}

AppInstance.contextTypes = {
    active: PropTypes.bool,
    focus: PropTypes.func
}

export default compose(
    AppInstance,
    connect(),
    withTabContext()
)
