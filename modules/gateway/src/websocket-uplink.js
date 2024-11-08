const {WebSocket} = require('ws')
const {finalize} = require('rxjs')
const {webSocket} = require('rxjs/webSocket')
const {webSocketEndpoints} = require('../config/endpoints')
const {autoRetry} = require('sepal/src/rxjs')
const {moduleTag, userTag} = require('./tag')
const log = require('#sepal/log').getLogger('websocket/uplink')

// const HEARTBEAT_INTERVAL_MS = 60 * 1000

const initializeUplink = (wss, servers, clients) => {
    
    const moduleReady = (module, ready) => {
        clients.broadcast({modules: {update: {[module]: ready}}})
        clients.forEach(user => servers.send(module, {user, online: true}))
    }

    // const onHeartbeat = (hb, module, upstream$) => {
    //     log.trace(`Sending heartbeat to ${moduleTag(module)}:`, hb)
    //     upstream$.next({hb})
    // }
    
    const onServerMessage = (rx, module) => {
        const {username, data, ready, hb} = rx
        if (hb) {
            log.trace(`Received heartbeat from ${moduleTag(module)}:`, hb)
        } else if (ready) {
            log.info(`${moduleTag(module)} connected`)
            moduleReady(module, true)
        } else {
            if (log.isTrace()) {
                log.trace(`Forwarding message to ${userTag(username)}:`, data)
            } else {
                log.debug(`Forwarding message to ${userTag(username)}`)
            }
            clients.send(username, {module, data})
        }
    }
    
    const onDownstreamError = (error, module) => {
        if (error.type === 'close') {
            log.debug(`Connection to ${moduleTag(module)} closed unexpectedly`)
        } else {
            log.error(`Connection to ${moduleTag(module)} error:`, error)
        }
    }
    
    const onDownstreamComplete = module => {
        log.error(`Connection to ${moduleTag(module)} complete (unexpected)`)
    }
    
    const initializeWebSocketClient = ({module, target}) => {
        log.debug(`Connecting to ${moduleTag(module)}`)

        const upstream$ = webSocket({
            url: target,
            WebSocketCtor: WebSocket
        })
    
        // const heartbeat$ = interval(HEARTBEAT_INTERVAL_MS).pipe(
        //     map(() => Date.now())
        // )
    
        const downstream$ = upstream$.pipe(
            autoRetry({
                maxRetries: null,
                minRetryDelay: 1000,
                onRetry: (error, retryMessage, retryDelay, retryCount) => {
                    if (retryCount === 1) {
                        log.info(`${moduleTag(module)} connection lost, retrying every ${retryDelay}ms.`)
                        moduleReady(module, false)
                    }
                }
            }),
            finalize(() => {
                servers.remove(module)
            })
        )

        // const subscription = merge(
        //     heartbeat$.pipe(map(hb => ({hb}))),
        //     downstream$.pipe(map(rx => ({rx})))
        // ).subscribe({
        //     next: ({hb, rx}) => {
        //         hb && onHeartbeat(hb, module, upstream$)
        //         rx && onServerMessage(rx, module, upstream$)
        //     },
        //     error: error => onDownstreamError(error, module),
        //     complete: () => onDownstreamComplete(module),
        // })
    
        const subscription = downstream$.subscribe({
            next: msg => onServerMessage(msg, module, upstream$),
            error: error => onDownstreamError(error, module),
            complete: () => onDownstreamComplete(module),
        })
    
        servers.add(module, upstream$, [subscription])
    }
    
    const initializeWebSocketClients = () => {
        webSocketEndpoints.forEach(webSocketEndpoint =>
            initializeWebSocketClient(webSocketEndpoint)
        )
    }
    
    initializeWebSocketClients()
}

module.exports = {initializeUplink}
