import logConfig from '#config/log.json' with {type: 'json'}
import {configureServer} from '#sepal/log'
configureServer(logConfig)

import express from 'express'

import {getLogger} from '#sepal/log'
const log = getLogger('main')
import {createProxyMiddleware} from 'http-proxy-middleware'
import _ from 'lodash'

import * as server from '#sepal/httpServer'

import {monitorApps} from './apps.js'
import {managementPort, monitorEnabled, port} from './config.js'
import {createCredentialsFile} from './gee.js'
import managementRoutes from './managementRoutes.js'
import {proxyEndpoints$, registerUpgradeListener} from './proxy.js'
import * as proxyManager from './proxyManager.js'
import {getRequestUser} from './user.js'

const startServer = () => {
    // This is the main server for the app launcher
    const app = express()

    // for managemente requests we use a proxy to the management server
    app.use(
        '/management',
        (req, res, next) => {
            const user = getRequestUser(req)
            if (user && user.admin) {
                next()
            } else {
                log.warn(`[management] unauthorized access attempt for ${req.originalUrl}`)
                res.status(403).send('Forbidden: Admin access required')
            }
        },
        createProxyMiddleware({
            target: `http://localhost:${managementPort}`,
            changeOrigin: true,
        })
    )
    
    const server = app.listen(port)
    
    // To handle new upgrade requests for proxy endpoints
    proxyManager.initialize(app, server)
    
    server.setMaxListeners(30)
    proxyEndpoints$(app).subscribe({
        next: proxies => registerUpgradeListener(server, proxies),
        error: error => log.error('Failed to register proxies.', error)
    })
}
const startManagementServer = async () => {
    const port = managementPort
    await server.start({
        port,
        routes: managementRoutes
    })
    log.info(`Management server started on port ${port}`)
}

const main = async () => {
    
    createCredentialsFile()
    await startManagementServer()
    startServer()
    
    if (monitorEnabled) {
        log.info('Starting app monitoring')
        monitorApps()
    } else {
        log.info('App monitoring disabled')
    }
    
    log.info('Initialized')
}

main().catch(error => {
    log.fatal(error)
    process.exit(1)
})
