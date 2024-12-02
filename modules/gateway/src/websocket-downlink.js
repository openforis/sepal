const {v4: uuid} = require('uuid')

const {moduleTag, userTag} = require('./tag')
const {filter, interval, map, Subject, groupBy, mergeMap, debounceTime, takeUntil} = require('rxjs')

const log = require('#sepal/log').getLogger('websocket/downlink')

const HEARTBEAT_INTERVAL_MS = 10 * 1000

const initializeDownlink = (servers, clients, wss) => {

    const heartbeatResponse$ = new Subject()

    heartbeatResponse$.pipe(
        groupBy(({clientId}) => clientId),
        mergeMap(groupId$ =>
            groupId$.pipe(
                debounceTime(HEARTBEAT_INTERVAL_MS * 2),
                takeUntil(clients.remove$.pipe(
                    filter(removedClientId$ => removedClientId$ === groupId$.key)
                ))
            )
        )
    ).subscribe({
        next: ({ws, user, clientId}) => onClientDisconnected(ws, user, clientId)
    })
    
    const onClientConnected = (ws, user) => {
        const clientId = uuid()
        log.info(`${userTag(user.username, clientId)} connected`)

        const heartbeatRequest$ = interval(HEARTBEAT_INTERVAL_MS).pipe(
            map(() => Date.now())
        )

        const heartbeatSubscription = heartbeatRequest$.subscribe(
            hb => {
                log.trace(`Sending heartbeat to user ${user.username}:`, hb)
                clients.send(clientId, {hb})
            }
        )

        clients.add(user, clientId, ws, [heartbeatSubscription])
        ws.on('message', message => onClientMessage(ws, message, user, clientId))
        ws.on('error', error => onClientError(ws, user, clientId, error))
        ws.on('close', () => onClientDisconnected(ws, user, clientId))
        clients.send(clientId, {modules: {state: servers.list()}})
        servers.broadcast({user, clientId, online: true})
    }
    
    const onClientMessage = (ws, message, user, clientId) => {
        if (message) {
            try {
                const {hb, module, subscriptionId, subscribed, data} = JSON.parse(message)
                if (hb) {
                    log.trace('Heartbeat reply received', hb)
                    heartbeatResponse$.next({ws, user, clientId})
                } else {
                    if (log.isTrace()) {
                        log.trace(`Forwarding message to ${moduleTag(module)}:`, data)
                    } else {
                        log.debug(`Forwarding message to ${moduleTag(module)}`)
                    }
                    servers.send(module, {user, clientId, subscriptionId, subscribed, data})
                }
            } catch (error) {
                log.error('Could not parse client message:', error)
            }
        }
    }
    
    const onClientError = (ws, user, clientId, error) => {
        log.error(`${userTag(user.username, clientId)} error:`, error)
        disconnect(ws, user, clientId)
    }
    
    const onClientDisconnected = (ws, user, clientId) => {
        log.info(`${userTag(user.username, clientId)} disconnected`)
        disconnect(ws, user, clientId)
    }

    const disconnect = (ws, user, clientId) => {
        ws.terminate()
        clients.remove(clientId)
        servers.broadcast({user, clientId, online: false})
    }
    
    const initializeWebSocketServer = () => {
        wss.on('connection', (ws, _req, user) =>
            onClientConnected(ws, user)
        )
    }

    initializeWebSocketServer()
}

module.exports = {initializeDownlink}
