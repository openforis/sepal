const {proxyEndpoints$, registerUpgradeListener} = require('./proxy')
const log = require('#sepal/log').getLogger('proxyManager')

let appInstance = null
let serverInstance = null

const initialize = (app, server) => {
    appInstance = app
    serverInstance = server
    log.debug('Proxy manager initialized')
}

const refreshProxyEndpoints = async () => {
    if (!appInstance) {
        throw new Error('Proxy manager not initialized - Express app not available')
    }

    try {
        log.info('Refreshing proxy endpoints...')
        
        const proxies = await new Promise((resolve, reject) => {
            proxyEndpoints$(appInstance).subscribe({
                next: resolve,
                error: reject
            })
        })
        
        // Re-register the upgrade listener with the new proxies
        if (serverInstance) {
            serverInstance.removeAllListeners('upgrade')
            registerUpgradeListener(serverInstance, proxies)
        }
        
        log.info(`Refreshed ${proxies.length} proxy endpoints`)
        return {
            success: true,
            count: proxies.length,
            proxies: proxies.map(p => ({path: p.path, target: p.target}))
        }
    } catch (error) {
        log.error('Failed to refresh proxy endpoints:', error)
        throw error
    }
}

module.exports = {
    initialize,
    refreshProxyEndpoints
}
