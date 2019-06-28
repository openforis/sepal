import {Subject, interval} from 'rxjs'

export class TerminalWebSocket {
    disposables = []
    subscriptions = []
    onMessageHandlers = []
    sendHeartbeat$ = new Subject()

    constructor({url, sendHeartbeatTimeout = 0, replyHeartbeats = false}) {
        this.url = url
        this.webSocket = new WebSocket(this.url)
        this.onClose(() => this.dispose())
        this.onError(() => this.dispose())
        this.addEventListener('message', message => {
            if (this.isHeartbeat(message.data)) {
                if (replyHeartbeats) {
                    this.sendHeartbeat$.next(true)
                }
            } else {
                this.onMessageHandlers.forEach(handler => handler(message))
            }
        })
        if (sendHeartbeatTimeout) {
            this.onOpen(() => {
                this.subscriptions.push(
                    interval(sendHeartbeatTimeout).subscribe(
                        () => this.sendHeartbeat$.next(false)
                    )
                )
            })
        }
        this.subscriptions.push(
            this.sendHeartbeat$.subscribe(
                forced => this.sendHeartbeat(forced)
            )
        )
    }

    isHeartbeat(data) {
        return !(data && data.length)
    }

    sendHeartbeat() {
        this.send('')
    }

    addEventListener(type, handler) {
        if (this.webSocket) {
            this.webSocket.addEventListener(type, handler)
            this.disposables.push(
                () => this.webSocket.removeEventListener(type, handler)
            )
        }
    }

    onOpen(handler) {
        this.addEventListener('open', handler)
    }

    onClose(handler) {
        this.addEventListener('close', handler)
    }

    onError(handler) {
        this.addEventListener('error', handler)
    }

    onMessage(handler) {
        this.onMessageHandlers.push(handler)
    }

    send(data) {
        if (this.webSocket) {
            this.webSocket.send(data)
        }
    }

    close() {
        if (this.webSocket) {
            this.webSocket.close()
        }
    }

    dispose() {
        this.disposables.forEach(dispose => dispose())
        this.subscriptions.forEach(subscription => subscription.unsubscribe())
        this.close()
    }
}
