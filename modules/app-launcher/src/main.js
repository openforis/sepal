require('#sepal/log').configureServer(require('#config/log.json'))

const express = require('express')
const log = require('#sepal/log').getLogger('main')
const url = require('url')
const {isMatch} = require('micromatch')
const _ = require('lodash')
const {port} = require('./config')
const {proxyEndpoints$} = require('./proxy')

const {createCredentialsFile} = require('./gee')
const {monitorApps} = require('./apps')
const {getRequestUser, setRequestUser} = require('./user')
const {usernameTag} = require('./tag')

const startServer = () => {
    const app = express()
    const server = app.listen(port)
    server.setMaxListeners(30)
    proxyEndpoints$(app).subscribe({
        next: proxies => registerUpgradeListener(server, proxies),
        error: error => log.error('Failed to register proxies.', error)
    })

}

const registerUpgradeListener = (server, proxies) => {
    server.on('upgrade', (req, socket, head) => {
        const requestPath = url.parse(req.url).pathname
        const user = getRequestUser(req)
        if (!user) {
            // TODO: Return a 400
            log.error(`${usernameTag(username)} Websocket upgrade without a user`)
            return
        }
        // TODO: Maybe not needed
        setRequestUser(req, user)
        
        const {proxy, target} = proxies
            .find(({path}) =>
                !path || requestPath === path || isMatch(requestPath, `${path}/**`)
            )
        const username = user.username
        if (proxy) {
            log.debug(`${usernameTag(username)} Requesting WebSocket upgrade for "${requestPath}" to target "${target}"`)
            proxy.upgrade(req, socket, head)
        } else {
            // TODO: Return a 400
            log.warn(`${usernameTag(username)} No proxy found for WebSocket upgrade "${requestPath}"`)
        }
    })
}

const main = async () => {
    createCredentialsFile()
    monitorApps()
    startServer()
    log.info('Initialized')
}

main().catch(error => {
    log.fatal(error)
    process.exit(1)
})
