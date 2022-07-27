import {ContentPadding} from 'widget/sectionLayout'
import {compose} from 'compose'
import {connect} from 'store'
import {forkJoin, of, switchMap, tap, timer} from 'rxjs'
import {get$} from 'http-client'
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
    iFrameRef = React.createRef()

    state = {
        appState: 'REQUESTED',
        src: undefined,
        srcDoc: undefined
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
        const {app: {label, alt, endpoint}} = this.props
        const {src, srcDoc} = this.state
        return !endpoint || srcDoc
            ? (
                <iframe
                    ref={this.iFrameRef}
                    width='100%'
                    height='100%'
                    frameBorder='0'
                    src={endpoint ? undefined : src}
                    title={label || alt}
                    style={{border: 'none', display: 'block'}}
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
            busy$.next(true)
            this.runApp()
        } else {
            this.setState({appState: 'INITIALIZED', src: path}, () =>
                stream('RUN_APP', of())
            )
        }
    }

    componentDidUpdate(_prevProps, prevState) {
        const {busy$, app: {endpoint}} = this.props
        const {srcDoc} = this.state
        const iFrame = this.iFrameRef.current
        if (endpoint && srcDoc && !prevState.srcDoc && iFrame) {
            const doc = iFrame.contentWindow.document
            doc.open()
            doc.write(srcDoc)
            doc.close()
            busy$.next(false)
        }
    }

    runApp() {
        const {app, stream} = this.props
        publishEvent('launch_app', {app: app.id})
        stream('RUN_APP',
            forkJoin([
                runApp$(app.path),
                timer(500)
            ]).pipe(
                tap(() => this.setState({appState: 'INITIALIZED'})),
                switchMap(() => get$(`api${app.path}`, {responseType: 'text', retries: 9}))
            ),
            srcDoc => this.setState({srcDoc}),
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
}

AppInstance.propTypes = {
    app: PropTypes.shape({
        alt: PropTypes.string,
        endpoint: PropTypes.string,
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
