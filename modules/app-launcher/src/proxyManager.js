const {proxyEndpoints$, registerUpgradeListener} = require('./proxy')
const log = require('#sepal/log').getLogger('proxyManager')

let appInstance = null
let serverInstance = null
let currentProxies = []

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
        
        if (serverInstance) {
            // Check if proxies actually changed to avoid unnecessary listener updates
            const hasChanged = !areProxiesEqual(currentProxies, proxies)
            if (hasChanged) {
                log.debug('Proxy configuration changed, updating upgrade listeners...')
                serverInstance.removeAllListeners('upgrade')
                registerUpgradeListener(serverInstance, proxies)
                log.info(`Updated upgrade listeners for ${proxies.length} proxy endpoints`)
            } else {
                log.debug('Proxy configuration unchanged, skipping listener update')
            }
        }
        
        currentProxies = proxies
        
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

const areProxiesEqual = (oldProxies, newProxies) => {
    if (oldProxies.length !== newProxies.length) {
        return false
    }
    
    const oldPaths = new Set(oldProxies.map(p => `${p.path}:${p.target}`))
    const newPaths = new Set(newProxies.map(p => `${p.path}:${p.target}`))
    
    return oldPaths.size === newPaths.size &&
           [...oldPaths].every(path => newPaths.has(path))
}

module.exports = {
    initialize,
    refreshProxyEndpoints
}
