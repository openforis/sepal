require('#sepal/log').configureServer(require('#config/log.json'))

const express = require('express')
const log = require('#sepal/log').getLogger('main')
const _ = require('lodash')
const {port, managementPort, monitorEnabled} = require('./config')
const {proxyEndpoints$, registerUpgradeListener} = require('./proxy')
const proxyManager = require('./proxyManager')
const managementRoutes = require('./managementRoutes')

const {createCredentialsFile} = require('./gee')
const {monitorApps} = require('./apps')
const server = require('#sepal/httpServer')
const {createProxyMiddleware} = require('http-proxy-middleware')

const startServer = () => {
    // This is the main server for the app launcher
    const app = express()

    // for managemente requests we use a proxy to the management server
    app.use(
        '/management',
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
