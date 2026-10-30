import {getLogger} from '#sepal/log'

import {buildAndRestart, getContainerInfo, getContainerLogs, pathExists, restartContainer} from './docker.js'
import {getRepoInfo} from './git.js'
import {validateAppName} from './validation.js'

const log = getLogger('appsService')

const getAppPath = appName => `/var/lib/sepal/app-launcher/apps/${appName}`

const getAppContainerStatus = async ctx => {
    const appName = validateAppName(ctx.params.appName)
    const appPath = getAppPath(appName)

    if (!await pathExists(appPath)) {
        ctx.status = 404
        ctx.body = {error: `App directory not found: ${appPath}`}
        return
    }
    
    try {
        const containerData = await getContainerInfo(appName)
        ctx.status = 200
        ctx.body = {
            container: containerData,
            error: null
        }
    } catch (error) {
        ctx.status = 500
        ctx.body = {error: error.message || 'Unknown error'}
    }
}

const getAppRepoInfo = async ctx => {
    const appName = validateAppName(ctx.params.appName)
    const appPath = getAppPath(appName)

    if (!await pathExists(appPath)) {
        ctx.status = 404
        ctx.body = {error: `App directory not found: ${appPath}`}
        return
    }
    
    try {
        const gitInfo = await getRepoInfo(appPath)
        ctx.status = 200
        ctx.body = {
            repo: gitInfo,
            error: null
        }
    } catch (error) {
        ctx.status = 500
        ctx.body = {error: error.message || 'Unknown error'}
    }
}

const getAppLogs = async ctx => {
    const appName = validateAppName(ctx.params.appName)
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
    const appName = validateAppName(ctx.params.appName)
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

const buildAndRestartApp = async ctx => {
    const appName = validateAppName(ctx.params.appName)
    const appPath = getAppPath(appName)
    
    log.debug(`Building and restarting app ${appName} at path ${appPath}`)
    
    if (!await pathExists(appPath)) {
        ctx.status = 404
        ctx.body = {error: `App directory not found: ${appPath}`}
        return
    }
    
    try {
        log.info('Rebuilding and restarting Docker containers.')
        const {url: repository} = await getRepoInfo(appPath)
        await buildAndRestart(appName, repository)
        
        ctx.status = 200
        ctx.body = {
            success: true,
            message: 'App rebuilt and restarted successfully'
        }
    } catch (error) {
        log.error(`Error building and restarting ${appName}: ${error.message}`)
        ctx.status = 500
        ctx.body = {error: error.message || 'Unknown error'}
    }
}

export {
    buildAndRestartApp,
    getAppContainerStatus,
    getAppLogs,
    getAppRepoInfo,
    restartApp,
}
