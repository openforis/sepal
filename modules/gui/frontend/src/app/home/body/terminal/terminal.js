import 'xterm/dist/xterm.css'
import * as fit from 'xterm/lib/addons/fit/fit'
import {ContentPadding} from 'widget/sectionLayout'
import {Subject} from 'rxjs'
import {Tabs} from 'widget/tabs/tabs'
import {TerminalWebSocket} from './terminalWebsocket'
import {Terminal as Xterm} from 'xterm'
import {compose} from 'compose'
import {connect} from 'store'
import {distinctUntilChanged, filter, map} from 'rxjs/operators'
import {msg} from 'translate'
import {post$} from 'http-client'
import {v4 as uuid} from 'uuid'
import {withLatestFrom} from 'rxjs/operators'
import Notifications from 'widget/notifications'
import React from 'react'
import ReactResizeDetector from 'react-resize-detector'
import styles from './terminal.module.css'
import withSubscriptions from 'subscription'

Xterm.applyAddon(fit)

const RESIZE_DEBOUNCE_MS = 250

export default class Terminal extends React.Component {
    render() {
        return (
            <Tabs
                label={msg('home.sections.terminal')}
                statePath='terminal'>
                {() => <TerminalSession/>}
            </Tabs>
        )
    }
}

class _TerminalSession extends React.Component {
    terminalContainer = React.createRef()
    terminal = new Xterm({
        rendererType: 'canvas'
    })
    webSocket = null
    enabled$ = new Subject()
    resize$ = new Subject()
    fit$ = new Subject()
    focus$ = new Subject()

    constructor(props) {
        super(props)
        const {stream} = props
        const {terminal, filterEnabled$, resize$, fit$, focus$} = this

        const sizeChanged$ = resize$.pipe(
            distinctUntilChanged(),
            filter(({dimensions}) => dimensions)
        )

        stream('REQUEST_RESIZE_TERMINAL',
            filterEnabled$(sizeChanged$),
            ({sessionId, dimensions}) => this.resize(sessionId, dimensions)
        )
        stream('REQUEST_FIT_TERMINAL',
            filterEnabled$(fit$),
            () => terminal.fit()
        )
        stream('REQUEST_FOCUS_TERMINAL',
            filterEnabled$(focus$),
            () => terminal.focus()
        )
    }

    filterEnabled$ = stream$ =>
        stream$.pipe(
            withLatestFrom(this.enabled$),
            filter(([, enabled]) => enabled),
            map(([stream$]) => stream$)
        )

    resize(sessionId, dimensions) {
        this.props.stream('RESIZE_TERMINAL',
            post$(`/api/terminal/${sessionId}/size`, {
                query: dimensions
            })
        )
    }

    render() {
        return (
            <ReactResizeDetector
                handleWidth
                handleHeight
                refreshMode='debounce'
                refreshRate={RESIZE_DEBOUNCE_MS}
                onResize={() => this.fit$.next()}
            >
                <ContentPadding menuPadding horizontalPadding verticalPadding>
                    <div className={styles.terminal} ref={this.terminalContainer}></div>
                </ContentPadding>
            </ReactResizeDetector>
        )
    }

    componentDidMount() {
        this.startSession(uuid())
    }

    componentWillUnmount() {
        this.terminal.dispose()
        this.webSocket && this.webSocket.dispose()
    }

    startSession(sessionId) {
        this.webSocket = new TerminalWebSocket({
            url: `wss://${window.location.hostname}:${window.location.port}/api/terminal/${sessionId}`,
            replyHeartbeats: true
        })

        this.webSocket.onOpen(() => this.startTerminal(sessionId))
        this.webSocket.onClose(() => console.log('socket closed'))
        this.webSocket.onError(() =>
            Notifications.error({
                message: msg('terminal.server.error')
            })
        )
    }

    startTerminal(sessionId) {
        const {terminal, terminalContainer, webSocket, resize$} = this
        const {onEnable, onDisable} = this.props
        terminal.setOption('allowTransparency', true)
        terminal.setOption('fontSize', 13)
        terminal.setOption('bellStyle', 'both')
        terminal.open(terminalContainer.current)
        // for some reason theme must be defined after open...
        terminal.setOption('theme', {
            background: 'transparent',
            foreground: '#ccc'
        })
        terminal.on('resize',
            dimensions => resize$.next({sessionId, dimensions})
        )
        this.enabled$.next(true)
        this.fit$.next()
        this.focus$.next()
        onEnable(() => {
            this.enabled$.next(true)
            this.fit$.next()
            this.focus$.next()
        })
        onDisable(() => {
            this.enabled$.next(false)
        })
        terminal.on('data', data => this.webSocket.send(data))
        webSocket.onMessage(message => terminal.write(message.data))
    }
}

const TerminalSession = compose(
    _TerminalSession,
    connect(),
    withSubscriptions()
)
