import PropTypes from 'prop-types'
import React from 'react'
import {forkJoin, map, of, switchMap, tap, timer} from 'rxjs'

import {runApp$} from '~/apps'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {publishEvent} from '~/eventPublisher'
import {get$} from '~/http-client'
import {getLogger} from '~/log'
import {msg} from '~/translate'
import {Notifications} from '~/widget/notifications'
import {ContentPadding} from '~/widget/sectionLayout'
import {withTab} from '~/widget/tabs/tabContext'

import styles from './appInstance.module.css'

const log = getLogger('apps')

class _AppInstance extends React.Component {
    iFrameRef = React.createRef()

    state = {
        appState: 'REQUESTED',
        src: undefined,
        srcDoc: undefined
    }

    constructor() {
        super()
        this.iFrameLoaded = this.iFrameLoaded.bind(this)
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
        const {app: {label, alt}} = this.props
        const {src, srcDoc} = this.state
        return this.useIFrameSrc() || srcDoc
            ? (
                <iframe
                    ref={this.iFrameRef}
                    width='100%'
                    height='100%'
                    frameBorder='0'
                    src={this.useIFrameSrc() ? src : undefined}
                    title={label || alt}
                    style={{border: 'none', display: 'block'}}
                    onLoad={this.iFrameLoaded}
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
        const {app: {id, endpoint, path}, tab: {busy}, stream} = this.props
        if (endpoint === 'docker') {
            busy.set(id, true)
            this.setState({appState: 'INITIALIZED'})
            publishEvent('launch_app', {app: id})
            stream('RUN_APP',
                get$(`${path}`, {
                    responseType: 'text',
                    retry: {
                        maxRetries: 9
                    }
                }).pipe(
                    map(srcDoc => ({srcDoc}))
                ),
                result => this.setState(result),
                error => this.onError(error)
            )
        } else if (!endpoint) {
            this.setState({appState: 'INITIALIZED', src: path}, () =>
                stream('RUN_APP', of())
            )
        } else {
            busy.set(id, true)
            this.runApp()
        }
    }

    componentDidUpdate(_prevProps, prevState) {
        const {app: {id}, tab: {busy}} = this.props
        const {srcDoc} = this.state
        const iFrame = this.iFrameRef.current
        if (!this.useIFrameSrc() && srcDoc && !prevState.srcDoc && iFrame) {
            const doc = iFrame.contentWindow.document
            doc.open()
            doc.write(srcDoc)
            doc.close()
            busy.set(id, false)
        }
    }

    useIFrameSrc() {
        const {app: {endpoint}} = this.props
        return !endpoint || ['rstudio', 'shiny'].includes(endpoint)
    }

    iFrameLoaded() {
        const {app: {id}, tab: {busy}} = this.props
        const {src} = this.state
        if (this.useIFrameSrc() && src) {
            busy.set(id, false)
            this.setState({appState: 'READY'})
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
                switchMap(() => {
                    if (this.useIFrameSrc()) {
                        return of({src: `/api${app.path}`})
                    } else {
                        return get$(`/api${app.path}`, {
                            responseType: 'text',
                            retry: {
                                maxRetries: 9
                            }
                        }).pipe(
                            map(srcDoc => ({srcDoc}))
                        )
                    }
                    
                })
            ),
            result => this.setState(result),
            error => this.onError(error)
        )
    }

    onError(error) {
        const {app: {id, label, alt}, tab: {busy}} = this.props
        log.error('Failed to load app', error)
        this.setState({appState: 'FAILED'})
        Notifications.error({message: msg('apps.run.error', {label: label || alt})})
        busy.set(id, false)
    }
}

export const AppInstance = compose(
    _AppInstance,
    connect(),
    withTab()
)

AppInstance.propTypes = {
    app: PropTypes.shape({
        alt: PropTypes.string,
        endpoint: PropTypes.string,
        label: PropTypes.string,
        path: PropTypes.string
    })
}
