import url from 'node:url'

import micromatch from 'micromatch'
import {firstValueFrom} from 'rxjs'

import {getLogger} from '#sepal/log'

import {webSocketPath} from '../config/endpoints.js'
import {isMetricsPath} from './metricsAccess.js'
import {urlTag, usernameTag} from './tag.js'
import {getSessionUsername, removeRequestSession, removeRequestUser, setRequestUser} from './user.js'

const log = getLogger('gateway')

// Upgrade requests bypass Express, so none of its middleware guards them: the headers the gateway owns
// are stripped and the user injected here, and only endpoints marked ws are proxied.
export const webSocketUpgradeHandler = ({sessionParser, userStore, wss, sandboxProxy, proxies}) => {
    const webSocketProxies = proxies.filter(({ws}) => ws)

    const handleGlobalWebSocket = (requestPath, req, socket, head, username, sessionId) => {
        log.debug(`Requesting WebSocket upgrade for ${requestPath}`)
        wss.handleUpgrade(req, socket, head, ws =>
            wss.emit('connection', ws, req, username, sessionId)
        )
    }

    const handleProxiedWebSocket = (requestPath, req, socket, head, username) => {
        if (isMetricsPath(requestPath)) {
            log.warn(`${usernameTag(username)} Refusing WebSocket upgrade to metrics "${requestPath}"`)
            refuse(socket, '403 Forbidden')
            return
        }
        // Dynamic sandbox ws upgrades (RStudio console, Jupyter kernel channels, Shiny) resolve their
        // target per-user via the session manager — route them to the sandbox proxy, not the static
        // proxies. sepal-user is already injected on req; pass the resolved username.
        if (sandboxProxy.matches(requestPath)) {
            log.debug(`${usernameTag(username)} Routing sandbox WebSocket upgrade for "${requestPath}"`)
            sandboxProxy.upgrade(req, socket, head, username)
            return
        }
        const {proxy, target} = webSocketProxies.find(({path}) => requestPath === path || micromatch.isMatch(requestPath, `${path}/**`)) || {}
        if (proxy) {
            log.debug(`${usernameTag(username)} Requesting WebSocket upgrade for "${requestPath}" to target "${target}"`)
            proxy.upgrade(req, socket, head)
        } else {
            log.warn(`${usernameTag(username)} No handler found for WebSocket upgrade "${requestPath}"`)
            refuse(socket, '404 Not Found')
        }
    }

    // HACK: User has to be injected here as the session is not available in proxyRes and proxyResWsz
    return (req, socket, head) => {
        sessionParser(req, {}, () => { // Make sure we have access to session for the websocket
            const username = getSessionUsername(req)
            removeRequestUser(req)
            removeRequestSession(req)
            if (username) {
                const requestPath = url.parse(req.url).pathname
                if (requestPath === webSocketPath) {
                    handleGlobalWebSocket(requestPath, req, socket, head, username, req.sessionID)
                } else {
                    firstValueFrom(userStore.getUser$(username))
                        .then(user => {
                            if (user?.status === 'ACTIVE') {
                                log.trace(`${usernameTag(username)} ${urlTag(requestPath)} Setting sepal-user header`)
                                setRequestUser(req, user)
                                handleProxiedWebSocket(requestPath, req, socket, head, username)
                            } else {
                                log.error(`${usernameTag(username)} User unavailable for websocket upgrade`)
                                refuse(socket, '401 Unauthorized')
                            }
                        })
                        .catch(error => {
                            log.error(`${usernameTag(username)} Error fetching user for websocket upgrade`, error)
                            refuse(socket, '401 Unauthorized')
                        })
                }
            } else {
                log.warn('Missing username for websocket upgrade')
                refuse(socket, '401 Unauthorized')
            }
        })
    }
}

const refuse = (socket, status) => {
    socket.write(`HTTP/1.1 ${status}\r\n\r\n`)
    socket.destroy()
}
