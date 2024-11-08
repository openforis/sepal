const {moduleTag, userTag} = require('./tag')
const log = require('#sepal/log').getLogger('websocket/downlink')

// const HEARTBEAT_INTERVAL_MS = 60 * 1000

const initializeDownlink = (wss, servers, clients) => {
    
    const onClientConnected = (ws, user) => {
        log.info(`${userTag(user.username)} connected`)
        ws.on('message', message => onClientMessage(message, user))
        ws.on('error', error => onClientError(ws, user, error))
        ws.on('close', () => onClientDisconnected(ws, user))

        // const heartbeat$ = interval(HEARTBEAT_INTERVAL_MS).pipe(
        //     map(() => Date.now())
        // )

        // const heartbeatSubscription = heartbeat$.subscribe(
        //     hb => {
        //         log.trace(`Sending heartbeat to user ${user.username}:`, hb)
        //         sendToClient(ws, {hb})
        //     }
        // )

        // clients.add(user, ws, [heartbeatSubscription])
        clients.add(user, ws, [])
        clients.send(user.username, {modules: {status: servers.list()}})
        servers.broadcast({user, online: true})
    }
    
    const onClientMessage = (message, user) => {
        if (message) {
            try {
                const {hb, module, data} = JSON.parse(message)
                if (hb) {
                    log.trace('Heartbeat reply received', hb)
                } else {
                    if (log.isTrace()) {
                        log.trace(`Forwarding message to ${moduleTag(module)}:`, data)
                    } else {
                        log.debug(`Forwarding message to ${moduleTag(module)}`)
                    }
                    servers.send(module, {user, data})
                }
            } catch (error) {
                log.error('Could not parse client message:', error)
            }
        }
    }
    
    const onClientError = (ws, user, error) => {
        log.error(`${userTag(user.username)} error:`, error)
        disconnect(ws, user)
    }
    
    const onClientDisconnected = (ws, user) => {
        log.info(`${userTag(user.username)} disconnected`)
        disconnect(ws, user)
    }

    const disconnect = (ws, user) => {
        ws.terminate()
        clients.remove(user.username)
        servers.broadcast({user, online: false})
    }
    
    const initializeWebSocketServer = () => {
        wss.on('connection', (ws, _req, user) =>
            onClientConnected(ws, user)
        )
    }

    initializeWebSocketServer()
}

module.exports = {initializeDownlink}
