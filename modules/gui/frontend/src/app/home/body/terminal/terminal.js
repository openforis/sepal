import 'xterm/dist/xterm.css'
import * as attach from 'xterm/lib/addons/attach/attach'
import * as fit from 'xterm/lib/addons/fit/fit'

import {Subject} from 'rxjs'
import {Terminal as Xterm} from 'xterm'
import {connect} from 'store'
import {distinctUntilChanged, filter, map} from 'rxjs/operators'
import {msg} from 'translate'
import {post$} from 'http-client'
import {withLatestFrom} from 'rxjs/operators'
import Notifications from 'widget/notifications'
import React from 'react'
import ReactResizeDetector from 'react-resize-detector'
import Tabs from 'widget/tabs'
import styles from './terminal.module.css'

Xterm.applyAddon(fit)
Xterm.applyAddon(attach)

export default class Terminal extends React.Component {
    render() {
        return (
            <Tabs
                label={msg('home.sections.terminal')}
                menuPadding
                edgePadding
                statePath='terminal'>
                {() => <TerminalSession/>}
            </Tabs>
        )
    }
}

class _TerminalSession extends React.Component {
    terminalContainer = React.createRef()
    terminal = new Xterm()
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
                refreshRate={500}
                onResize={() => this.fit$.next()}
            >
                <div className={styles.terminal} ref={this.terminalContainer}/>
            </ReactResizeDetector>
        )
    }

    componentDidMount() {
        this.initializeSession()
    }

    componentWillUnmount() {
        this.terminal.dispose()
        this.webSocket.close()
    }

    initializeSession() {
        this.props.stream('INITIALIZE_TERMINAL',
            post$('/api/terminal').pipe(
                map(e => e.response)
            ),
            sessionId => this.startSession(sessionId),
            error => Notifications.error({
                message: msg('terminal.server.error'),
                error
            })
        )
    }

    createWebSocket(sessionId) {
        const webSocket = new WebSocket(`ws://${window.location.hostname}:8000/${sessionId}`)
        this.webSocket = webSocket
        return webSocket
    }

    startSession(sessionId) {
        const {terminal, terminalContainer, resize$} = this
        const {onEnable, onDisable} = this.props

        terminal.open(terminalContainer.current)
        terminal.attach(this.createWebSocket(sessionId))
        terminal.setOption('allowTransparency', true)
        terminal.setOption('fontSize', 13)
        terminal.setOption('bellStyle', 'both')
        terminal.setOption('theme', {
            background: 'transparent',
            foreground: '#ccc'
        })
        this.enabled$.next(true)
        this.fit$.next()
        this.focus$.next()
        this.resize$.next({})
        terminal.on('resize', dimensions => resize$.next({sessionId, dimensions}))
        onEnable(() => {
            this.enabled$.next(true)
            this.fit$.next()
            this.focus$.next()
        })
        onDisable(() => {
            this.enabled$.next(false)
        })
    }
}

const TerminalSession = connect()(_TerminalSession)
