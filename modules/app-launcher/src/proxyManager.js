import express from 'express'
import {firstValueFrom, retry, tap} from 'rxjs'

import {getLogger} from '#sepal/log'

import {proxyEndpoints$, registerUpgradeListener} from './proxy.js'

const log = getLogger('proxyManager')

const REGISTER_RETRY_DELAY_MS = 30 * 1000

let appInstance = null
let serverInstance = null
let currentProxies = []
let activeRouter = express.Router()

const initialize = (app, server) => {
    appInstance = app
    serverInstance = server
    // Express keeps every layer it is given, and the oldest match wins. Mount one stable layer here and
    // swap the router behind it, so a refresh replaces the app routes instead of shadowing them.
    app.use((req, res, next) => activeRouter(req, res, next))
    log.debug('Proxy manager initialized')
}

const activate = (router, proxies) => {
    activeRouter = router
    currentProxies = proxies
    if (serverInstance) {
        serverInstance.removeAllListeners('upgrade')
        registerUpgradeListener(serverInstance, proxies)
    }
}

const proxies$ = () => {
    if (!appInstance) {
        throw new Error('Proxy manager not initialized - Express app not available')
    }
    const router = express.Router()
    return proxyEndpoints$(router).pipe(
        tap(proxies => activate(router, proxies))
    )
}

// The catalog comes from the gateway, which may still be starting. Keep trying, or no app gets a route.
const registerProxies$ = () => proxies$().pipe(
    retry({delay: REGISTER_RETRY_DELAY_MS})
)

const refreshProxyEndpoints = async () => {
    log.info('Refreshing proxy endpoints...')
    const proxies = await firstValueFrom(proxies$())
    log.info(`Refreshed ${proxies.length} proxy endpoints`)
    return {
        success: true,
        count: proxies.length,
        proxies: proxies.map(p => ({path: p.path, target: p.target}))
    }
}

const hasProxies = () => currentProxies.length > 0

export {
    hasProxies,
    initialize,
    refreshProxyEndpoints,
    registerProxies$
}
