require('#sepal/log').configureServer(require('#config/log.json'))

const {amqpUri, redisUri, port, secure} = require('./config')
const {initializeWebSocketServer} = require('./websocket')
const {isMatch} = require('micromatch')
const express = require('express')
const Redis = require('ioredis')
const Session = require('express-session')
const {v4: uuid} = require('uuid')
const url = require('url')
const {WebSocketServer} = require('ws')
const {Subject} = require('rxjs')

const apiMetrics = require('prometheus-api-metrics')
const {RedisStore: RedisSessionStore} = require('connect-redis')

const log = require('#sepal/log').getLogger('gateway')

const {initMessageQueue} = require('#sepal/messageQueue')

const {Auth} = require('./auth')
const {Proxy} = require('./proxy')
const {SessionManager} = require('./session')
const {setRequestUser, getSessionUsername} = require('./user')
const {UserStore} = require('./userStore')
const {initializeGoogleAccessTokenRefresher} = require('./googleAccessToken')
const {usernameTag, urlTag} = require('./tag')
const {webSocketPath} = require('../config/endpoints')

const toUser$ = new Subject()
const userStatus$ = new Subject()

const redis = new Redis(redisUri)
const userStore = UserStore(redis)
const sessionStore = new RedisSessionStore({client: redis})

const {messageHandler, logout, invalidateOtherSessions} = SessionManager(sessionStore, userStore)
const {authMiddleware} = Auth(userStore)
const {proxyEndpoints} = Proxy(userStore, authMiddleware)

const getSecret = async () => {
    const secret = await redis.get('secret')

    if (secret) {
        log.info('Reusing saved secret')
        return secret
    } else {
        const secret = uuid()
        log.info('Creating new secret')
        await redis.set('secret', secret)
        return secret
    }
}

const main = async () => {
    await initMessageQueue(amqpUri, {
        subscribers: [
            {queue: 'gateway.userLocked', topic: 'user.UserLocked', handler: messageHandler}
        ]
    })

    const app = express()
    const secret = await getSecret()

    const sessionParser = Session({
        store: sessionStore,
        secret,
        name: 'SEPAL-SESSIONID',
        cookie: {
            httpOnly: true,
            sameSite: secure,
            secure
        },
        proxy: true,
        resave: false,
        saveUninitialized: false,
        unset: 'destroy'
    })
    
    app.use(sessionParser)
    app.use(userStore.userMiddleware)

    app.use('/api/user/logout', logout)
    app.use('/api/user/invalidateOtherSessions', invalidateOtherSessions)
    app.use('/api/gateway/metrics', authMiddleware, apiMetrics({metricsPath: '/api/gateway/metrics'}))

    const proxies = proxyEndpoints(app)
    const server = app.listen(port)

    const wss = new WebSocketServer({
        noServer: true,
        perMessageDeflate: false
    })

    // avoid MaxListenersExceededWarning
    server.setMaxListeners(30)

    const webSocketAccessDenied = socket => {
        log.warn('WebSocket access denied without a username')
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        socket.destroy()
    }

    const handleGlobalWebSocket = (requestPath, req, socket, head, username) => {
        log.debug(`Requesting WebSocket upgrade for ${requestPath}`)
        wss.handleUpgrade(req, socket, head, ws =>
            wss.emit('connection', ws, req, username)
        )
    }

    const handleProxiedWebSocket = (requestPath, req, socket, head, username) => {
        const {proxy, target} = proxies.find(({path}) => !path || requestPath === path || isMatch(requestPath, `${path}/**`)) || {}
        if (proxy) {
            log.debug(`${usernameTag(username)} Requesting WebSocket upgrade for "${requestPath}" to target "${target}"`)
            proxy.upgrade(req, socket, head)
        } else {
            log.warn(`${usernameTag(username)} No handler found for WebSocket upgrade "${requestPath}"`)
            webSocketAccessDenied(socket)
        }
    }

    initializeGoogleAccessTokenRefresher({userStore, userStatus$, toUser$})

    initializeWebSocketServer({wss, userStore, userStatus$, toUser$})

    // HACK: User has to be injected here as the session is not available in proxyRes and proxyResWsz
    server.on('upgrade', (req, socket, head) => {
        sessionParser(req, {}, () => { // Make sure we have access to session for the websocket
            const username = getSessionUsername(req)
            if (username) {
                const requestPath = url.parse(req.url).pathname
                if (requestPath === webSocketPath) {
                    handleGlobalWebSocket(requestPath, req, socket, head, username)
                } else {
                    userStore.getUser(username).then(user => {
                        if (user) {
                            log.trace(`${usernameTag(username)} ${urlTag(requestPath)} Setting sepal-user header`)
                            setRequestUser(req, user)
                        } else {
                            log.warn(`${usernameTag(username)} Websocket upgrade without a user`)
                        }
                        handleProxiedWebSocket(requestPath, req, socket, head, username)
                    })
                }
            } else {
                webSocketAccessDenied(socket)
            }
        })
    })
    
    process.on('uncaughtException', error => {
        log.fatal('Uncaught exception', error)
    })
}

main().catch(error => {
    log.fatal(error)
    process.exit(1)
})
