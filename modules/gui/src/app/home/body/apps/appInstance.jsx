import PropTypes from 'prop-types'
import React from 'react'
import {forkJoin, map, of, switchMap, tap, timer} from 'rxjs'

import api from '~/apiRegistry'
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

// The interaction signal (docs/session-expiration-model.md §4a). Apps render in SAME-ORIGIN
// iframes, so their input events are observable from here — which is what separates "a human did
// something" from "a tab is open on an app that polls its backend", the distinction the old
// heartbeat could not make and that kept forgotten tabs alive indefinitely.
//
// Capture phase, passive: the app's own handlers must be unaffected, and nothing here may delay
// input. Attribution is per session — input in the SEPAL shell reaches no iframe and extends
// nothing, which falls out naturally since only the focused tab receives input.
const INTERACTION_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart']
const INTERACTION_LISTENER_OPTIONS = {capture: true, passive: true}
const REPORT_INTERVAL_MS = 60 * 1000

class _AppInstance extends React.Component {
    iFrameRef = React.createRef()

    sessionId = null
    interactionDocument = null
    observable = true
    lastReportTime = 0
    observableTimer = null

    state = {
        appState: 'REQUESTED',
        src: undefined,
        srcDoc: undefined
    }

    constructor(props) {
        super(props)
        this.iFrameLoaded = this.iFrameLoaded.bind(this)
        this.onInteraction = this.onInteraction.bind(this)
        this.onSession = this.onSession.bind(this)
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
            publishEvent('launch_app', {app: id})
            stream('RUN_APP',
                get$(`${path}`, {
                    responseType: 'text',
                    retry: {
                        maxRetries: 9
                    }
                }).pipe(
                    map(() => ({appState: 'INITIALIZED', src: path}))
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
        return !endpoint || ['rstudio', 'shiny', 'docker'].includes(endpoint)
    }

    iFrameLoaded() {
        const {app: {id}, tab: {busy}} = this.props
        const {src} = this.state
        // Apps navigate their frame after sign-in, which replaces the document the listeners were
        // attached to — so they are re-attached on every load, not just on mount.
        this.attachInteractionListeners()
        if (this.useIFrameSrc() && src) {
            busy.set(id, false)
            this.setState({appState: 'READY'})
        }
    }

    onSession(session) {
        const {onSession} = this.props
        this.sessionId = session?.id ?? this.sessionId
        onSession && onSession(session)
    }

    // attachInteractionListeners — best-effort by construction. An inaccessible frame (an app
    // that navigated genuinely cross-origin) throws on contentDocument, and that is DECLARED to
    // the gateway rather than swallowed: it cannot otherwise tell "the GUI cannot observe this
    // app" from "the GUI can observe it and nobody is touching it", and those must produce
    // opposite outcomes. Wrapped in try/catch so a hostile frame degrades the signal instead of
    // throwing into the render path.
    attachInteractionListeners() {
        this.detachInteractionListeners()
        const iFrame = this.iFrameRef.current
        if (!iFrame) {
            return
        }
        try {
            const doc = iFrame.contentDocument
            if (!doc) {
                throw new Error('No contentDocument')
            }
            INTERACTION_EVENTS.forEach(event =>
                doc.addEventListener(event, this.onInteraction, INTERACTION_LISTENER_OPTIONS))
            this.interactionDocument = doc
            this.setObservable(true)
        } catch (_error) {
            log.debug('App iframe is not observable — falling back to proxied-request attribution')
            this.setObservable(false)
        }
    }

    detachInteractionListeners() {
        const doc = this.interactionDocument
        this.interactionDocument = null
        if (!doc) {
            return
        }
        try {
            INTERACTION_EVENTS.forEach(event =>
                doc.removeEventListener(event, this.onInteraction, INTERACTION_LISTENER_OPTIONS))
        } catch (_error) {
            // frame already destroyed — nothing to detach from
        }
    }

    // The unobservable declaration is held by the gateway with a short TTL, so it has to be
    // re-asserted for as long as it holds; an observable app needs no such upkeep, because its
    // input reports say everything.
    setObservable(observable) {
        this.observable = observable
        clearInterval(this.observableTimer)
        this.observableTimer = null
        if (!observable) {
            this.reportUnobservable()
            this.observableTimer = setInterval(() => this.reportUnobservable(), REPORT_INTERVAL_MS)
        }
    }

    reportUnobservable() {
        if (this.sessionId) {
            api.apps.reportInteraction$({sessionId: this.sessionId, observable: false}).subscribe({
                error: error => log.debug('Failed to report app observability', error)
            })
        }
    }

    // Coalesced to at most one report per session per interval: this fires on every keystroke, and
    // the deadline moves in 15-minute steps — reporting each one would be pure noise.
    onInteraction() {
        const now = Date.now()
        if (!this.sessionId || now - this.lastReportTime < REPORT_INTERVAL_MS) {
            return
        }
        this.lastReportTime = now
        api.apps.reportInteraction$({sessionId: this.sessionId}).subscribe({
            error: error => log.debug('Failed to report app interaction', error)
        })
    }

    componentWillUnmount() {
        clearInterval(this.observableTimer)
        this.detachInteractionListeners()
        this.unloadIFrame()
    }

    unloadIFrame() {
        const iFrame = this.iFrameRef.current
        if (!iFrame?.contentWindow) {
            return
        }
        try {
            iFrame.contentWindow.dispatchEvent(new Event('beforeunload'))
        } catch (_error) {
            // iframe may already be destroyed
        }
    }

    runApp() {
        const {app, selection, stream} = this.props
        publishEvent('launch_app', {app: app.id})
        stream('RUN_APP',
            forkJoin([
                runApp$(app.path, {...selection, onSession: this.onSession}),
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
    }),
    selection: PropTypes.object,
    onSession: PropTypes.func
}
