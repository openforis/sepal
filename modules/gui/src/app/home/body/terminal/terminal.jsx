import '@xterm/xterm/css/xterm.css'

import {FitAddon} from '@xterm/addon-fit'
import {Terminal as Xterm} from '@xterm/xterm'
import React from 'react'
import {distinctUntilChanged, filter, map, Subject, withLatestFrom} from 'rxjs'

import {compose} from '~/compose'
import {connect} from '~/connect'
import {withEnableDetector} from '~/enabled'
import {post$} from '~/http-client'
import {themeManager} from '~/theme'
import {msg} from '~/translate'
import {uuid} from '~/uuid'
import {ElementResizeDetector} from '~/widget/elementResizeDetector'
import {Keybinding} from '~/widget/keybinding'
import {Notifications} from '~/widget/notifications'
import {ContentPadding} from '~/widget/sectionLayout'
import {setTabPlaceholder} from '~/widget/tabs/tabActions'
import {Tabs} from '~/widget/tabs/tabs'

import styles from './terminal.module.css'
import {TerminalWebSocket} from './terminalWebsocket'

const STATE_PATH = 'terminal'

export class Terminal extends React.Component {
    render() {
        return (
            <Tabs
                label={msg('home.sections.terminal')}
                statePath={STATE_PATH}>
                {({id}) => <TerminalSession tabId={id}/>}
            </Tabs>
        )
    }
}

class _TerminalSession extends React.Component {
    terminalContainer = React.createRef()
    terminal = new Xterm()
    fitAddon = new FitAddon()
    webSocket = null
    enabled$ = new Subject()
    resize$ = new Subject()
    fit$ = new Subject()
    focus$ = new Subject()

    constructor(props) {
        super(props)
        const {stream} = props
        const {terminal, fitAddon, filterEnabled$, resize$, fit$, focus$} = this

        terminal.loadAddon(fitAddon)

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
            () => fitAddon.fit()
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
            <ContentPadding menuPadding horizontalPadding verticalPadding>
                <Keybinding keymap={{' ': undefined}}>
                    <ElementResizeDetector targetRef={this.terminalContainer} resize$={this.fit$}>
                        <div ref={this.terminalContainer} className={styles.terminal}></div>
                    </ElementResizeDetector>
                </Keybinding>
            </ContentPadding>
        )
    }

    componentDidMount() {
        this.startSession(uuid())
    }

    componentWillUnmount() {
        this.themeSubscription?.unsubscribe()
        this.terminal.dispose()
        this.webSocket && this.webSocket.dispose()
    }

    startSession(sessionId) {
        this.webSocket = new TerminalWebSocket({
            url: `wss://${window.location.hostname}:${window.location.port}/api/terminal/${sessionId}`,
            replyHeartbeats: true
        })
        this.webSocket.onOpen(() => this.startTerminal(sessionId))
        // this.webSocket.onClose(() => console.log('socket closed'))
        this.webSocket.onError(() =>
            Notifications.error({
                message: msg('terminal.server.error')
            })
        )
    }

    startTerminal(sessionId) {
        const {terminal, terminalContainer, webSocket, resize$} = this
        const {enableDetector: {onEnable, onDisable}} = this.props
        terminal.options.allowTransparency = true
        terminal.options.fontSize = 13
        terminal.options.bellStyle = 'both'
        terminal.open(terminalContainer.current)
        // for some reason theme must be defined after open...
        this.themeSubscription = themeManager.theme$.subscribe(
            theme => terminal.options.theme = TERMINAL_THEMES[theme]
        )
        terminal.onResize(
            dimensions => resize$.next({sessionId, dimensions})
        )
        // The ssh-gateway sets the terminal title to the session the user just entered
        // ("1: lazy-paper"), and clears it on the way back to its menu — the only thing that
        // knows, from out here, which machine this tab is attached to.
        terminal.onTitleChange(
            title => setTabPlaceholder(title, STATE_PATH, this.props.tabId)
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
        terminal.onData(data => this.webSocket.send(data))
        webSocket.onMessage(message => terminal.write(message.data))
    }
}

const TERMINAL_THEMES = {
    dark: {
        background: '#00000000',
        foreground: '#ccc'
    },
    light: {
        background: '#00000000',
        foreground: '#2b2926',
        cursor: '#2b2926',
        cursorAccent: '#f6f4f0',
        selectionBackground: 'rgba(120, 100, 60, .25)',
        black: '#2b2926',
        red: '#b3261e',
        green: '#2e7d32',
        yellow: '#8a6100',
        blue: '#1f5fa8',
        magenta: '#8e3b8e',
        cyan: '#0f6f7a',
        white: '#6b6760',
        brightBlack: '#5c5850',
        brightRed: '#c62828',
        brightGreen: '#388e3c',
        brightYellow: '#9e7000',
        brightBlue: '#2c6fbe',
        brightMagenta: '#a04aa0',
        brightCyan: '#16808c',
        brightWhite: '#8a857c'
    }
}

const TerminalSession = compose(
    _TerminalSession,
    connect(),
    withEnableDetector()
)
