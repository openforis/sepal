const {getRepoInfo, pullUpdates} = require('./git')
const {pathExists, getContainerInfo, isContainerRunning, startContainer, buildAndRestart, restartContainer, getContainerLogs} = require('./docker')
const log = require('#sepal/log').getLogger('appsService')

const {EMPTY, catchError, map} = require('rxjs')
const {get$} = require('#sepal/httpClient')
const {sepalHost, sepalAdminPassword} = require('./config')

const getAppPath = appName => `/var/lib/sepal/app-manager/apps/${appName}`

const fetchAppsFromApi$ = () => {

    const apiUrl = `https://${sepalHost}/api/apps/list`
    return get$(apiUrl, {
        username: 'sepalsAdmin',
        password: sepalAdminPassword,
    }).pipe(
        map(response => JSON.parse(response.body)),
        catchError(error => {
            log.error('Failed to fetch apps from API:', error)
            return EMPTY
        })
    )
}

const getAppStatus = async ctx => {
    const {appName} = ctx.params
    const appPath = getAppPath(appName)

    if (!await pathExists(appPath)) {
        ctx.status = 404
        ctx.body = {error: `App directory not found: ${appPath}`}
        return
    }
    
    try {
        const gitInfo = await getRepoInfo(appPath)
        const containerData = await getContainerInfo(appName)
        ctx.status = 200
        ctx.body = {
            repo: gitInfo,
            container: containerData,
            error: null
        }
    } catch (error) {
        ctx.status = 500
        ctx.body = {error: error.message || 'Unknown error'}
    }
}

const getAppLogs = async ctx => {
    const {appName} = ctx.params
    const {query} = ctx.request
    const appPath = getAppPath(appName)
    const {lines = 50} = query || {}
    
    try {
        if (!await pathExists(appPath)) {
            ctx.status = 404
            ctx.body = {error: `App directory not found: ${appPath}`}
            return
        }
        
        try {
            const logs = await getContainerLogs(appName, {lines})
            ctx.status = 200
            ctx.body = {logs}
        } catch (containerError) {
            log.warn(`Error getting logs for app ${appName}: ${containerError.message}`)
            ctx.status = 200
            ctx.body = {logs: [`Failed to get logs: ${containerError.message}`]}
        }
    } catch (error) {
        log.error(`Error getting logs for ${appName}: ${error.message}`)
        ctx.status = 500
        ctx.body = {error: error.message || 'Unknown error'}
    }
}

const restartApp = async ctx => {
    const {appName} = ctx.params
    const appPath = getAppPath(appName)
    
    if (!await pathExists(appPath)) {
        ctx.status = 404
        ctx.body = {error: `App directory not found: ${appPath}`}
        return
    }
    
    try {
        await restartContainer(appName)
        ctx.status = 200
        ctx.body = {success: true, message: `App ${appName} restarted successfully`}
    } catch (error) {
        log.error(`Error restarting ${appName}: ${error.message}`)
        ctx.status = 500
        ctx.body = {error: error.message || 'Unknown error'}
    }
}

const updateApp = async ctx => {
    const {appName} = ctx.params
    const {branch} = ctx.query
    const appPath = getAppPath(appName)
    
    log.debug(`Updating app ${appName} at path ${appPath} on branch ${branch}`)
    
    if (!await pathExists(appPath)) {
        ctx.status = 404
        ctx.body = {error: `App directory not found: ${appPath}`}
        return
    }
    
    let gitAction
    try {
        const result = await pullUpdates(appPath, branch)
        gitAction = result.gitAction
    } catch (gitError) {
        log.error(`Git operation failed: ${gitError.message}`)
        ctx.status = 500
        ctx.body = {error: `Git operation failed: ${gitError.message}`}
        return
    }
    
    let updated = gitAction === 'updated'
    let message
    try {
        if (updated) {
            log.info('Repository updated. Rebuilding and restarting Docker containers.')
            await buildAndRestart(appName)
            message = 'App updated successfully and rebuilt'
        } else {
            const running = await isContainerRunning(appName)
            if (!running) {
                log.info('Containers are not running. Starting them without rebuilding.')
                await startContainer(appName)
                message = 'App containers started (no updates available)'
            } else {
                message = 'App already up to date'
            }
        }
        
        ctx.status = 200
        ctx.body = {
            success: true,
            message,
            updated,
        }
    } catch (error) {
        log.error(`Error managing containers for ${appName}: ${error.message}`)
        ctx.status = 500
        ctx.body = {error: error.message || 'Unknown error'}
    }
}

module.exports = {
    getAppStatus,
    getAppLogs,
    restartApp,
    updateApp,
    fetchAppsFromApi$,
}
