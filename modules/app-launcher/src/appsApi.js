const log = require('#sepal/log').getLogger('managementRoutes')
const fs = require('fs')
const {ClientException} = require('sepal/src/exception')
const {exec} = require('child_process')
const util = require('util')
const Docker = require('dockerode')
const docker = new Docker() // Connects to the Docker socket

const execPromise = util.promisify(exec)

const executeCommand = async command => {
    try {
        log.debug(() => `Executing command: ${command}`)
        const {stdout, stderr} = await execPromise(command)
        return {stdout, stderr}
    } catch (error) {
        log.error(`Command execution failed: ${error.message}`)
        throw new ClientException(`Command execution failed: ${error.stderr || error.message}`)
    }
}

const getGitInfo = async appPath => {
    const {stdout: commitTimestamp} = await executeCommand(`cd ${appPath} && git log -1 --format=%cd`)
    const {stdout: commitId} = await executeCommand(`cd ${appPath} && git log -1 --format=%H`)
    const {stdout: originUrl} = await executeCommand(`cd ${appPath} && git config --get remote.origin.url`)
    
    let commitUrl = null
    const trimmedOriginUrl = originUrl.trim()
    if (trimmedOriginUrl) {
        // Handle different git URL formats (HTTPS or SSH)
        if (trimmedOriginUrl.includes('github.com')) {
            let repoUrl = trimmedOriginUrl
            if (repoUrl.startsWith('git@github.com:')) {
                repoUrl = repoUrl.replace('git@github.com:', 'https://github.com/')
            }
            if (repoUrl.endsWith('.git')) {
                repoUrl = repoUrl.substring(0, repoUrl.length - 4)
            }
            commitUrl = `${repoUrl}/commit/${commitId.trim()}`
        }
    }
    
    let updateAvailable = false
    try {
        const {stdout: revOut} = await executeCommand(`cd ${appPath} && git remote update && git rev-parse HEAD && git rev-parse @{u}`)
        const [localCommit, remoteCommit] = revOut.trim().split('\n')
        updateAvailable = localCommit !== remoteCommit
    } catch (revErr) {
        log.warn(`Failed to check for updates: ${revErr.message}`)
    }
    
    return {
        lastCloneTimestamp: commitTimestamp.trim() ? new Date(commitTimestamp.trim()).toISOString() : null,
        lastCommitId: commitId.trim(),
        url: originUrl.trim(),
        commitUrl,
        updateAvailable
    }
}

const getContainerStats = async containerId => {
    try {
        const containerInstance = docker.getContainer(containerId)
        const stats = await containerInstance.stats({stream: false})
        
        const memoryUsage = stats.memory_stats.usage
        const memoryLimit = stats.memory_stats.limit
        
        const memoryPercent = ((memoryUsage / memoryLimit) * 100).toFixed(2)
        const memoryUsageMB = (memoryUsage / (1024 * 1024)).toFixed(2)
        const memoryLimitMB = (memoryLimit / (1024 * 1024)).toFixed(2)
        
        return {
            memoryUsage: `${memoryUsageMB} MB`,
            memoryLimit: `${memoryLimitMB} MB`,
            memoryPercent: `${memoryPercent}%`,
            cpuPercent: calculateCPUPercentage(stats)
        }
    } catch (error) {
        log.warn(`Failed to get container stats: ${error.message}`)
        return {
            memoryUsage: 'N/A',
            memoryLimit: 'N/A',
            memoryPercent: 'N/A',
            cpuPercent: 'N/A'
        }
    }
}

const calculateCPUPercentage = stats => {
    try {
        const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage
        const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage
        const cpuCount = stats.cpu_stats.online_cpus || stats.cpu_stats.cpu_usage.percpu_usage?.length || 1
        
        if (systemDelta > 0 && cpuDelta > 0) {
            const cpuPercent = ((cpuDelta / systemDelta) * cpuCount * 100).toFixed(2)
            return `${cpuPercent}%`
        }
        return '0.00%'
    } catch (error) {
        return 'N/A'
    }
}

const getContainerInfo = async appName => {
    const containers = await docker.listContainers({
        all: true,
        filters: JSON.stringify({
            name: [`/${appName}`],
        })
    })
    
    if (!containers || containers.length === 0) {
        return null
    }
    
    const containerId = containers[0].Id
    const containerInstance = docker.getContainer(containerId)
    const inspectData = await containerInstance.inspect()
        
    const containerInfo = {
        id: containerId.substring(0, 12),
        names: inspectData.Name ? [inspectData.Name] : containers[0].Names,
        image: inspectData.Image,
        status: inspectData.State.Status
    }
    
    if (inspectData.State && inspectData.State.Health) {
        containerInfo.health = {
            status: inspectData.State.Health.Status,
            failingStreak: inspectData.State.Health.FailingStreak,
            log: inspectData.State.Health.Log
        }
    }

    if (inspectData.State.Status === 'running') {
        try {
            const stats = await getContainerStats(containerId)
            containerInfo.stats = stats
            
            // TODO: get the number of connected clients
            // const clients = await getConnectedClients(containerId)
            // containerInfo.clients = clients
        } catch (error) {
            log.warn(`Failed to get extended container info: ${error.message}`)
        }
    } else {
        containerInfo.stats = {
            memoryUsage: 'N/A',
            memoryLimit: 'N/A',
            memoryPercent: 'N/A',
            cpuPercent: 'N/A'
        }
        // containerInfo.clients = {
        //     count: 0
        // }
    }
        
    return containerInfo
}

const getAppStatus = async (appName, request, ctx) => {

    const appPath = `/var/lib/sepal/app-manager/apps/${appName}`

    if (!fs.existsSync(appPath)) {
        log.debug('Does not exist', appName)
        ctx.status = 404
        ctx.body = {error: `App directory not found: ${appPath}`}
        return
    }

    log.debug('Exists!!!', appName)
    
    try {
        const gitInfo = await getGitInfo(appPath)
        const containerData = await getContainerInfo(appName)

        const response = {
            repo: gitInfo,
            container: containerData,
            error: null
        }

        log.debug('Container data', response)

        ctx.status = 200
        ctx.body = response
        
    } catch (error) {
        log.error(`Error getting status for ${appName}: ${error.message}`)
        ctx.status = 500
        ctx.body = {error: error.message || 'Unknown error'}
    }
}

const getAppLogs = async (appName, request, ctx) => {
    const appPath = `/var/lib/sepal/app-manager/apps/${appName}`
    const logLines = request.query.lines || 50
    
    try {
        if (!fs.existsSync(appPath)) {
            ctx.status = 404
            ctx.body = {error: `App directory not found: ${appPath}`}
            return
        }
        
        const containerInfo = await getContainerInfo(appName)
        
        if (!containerInfo) {
            ctx.status = 200
            ctx.body = {logs: ['Noss container found for this app']}
            return
        }
        
        try {
            const containerInstance = docker.getContainer(containerInfo.id)
            const logOptions = {
                stdout: true,
                stderr: true,
                tail: logLines,
            }
            
            const containerLogs = await containerInstance.logs(logOptions)
            const logString = containerLogs.toString('utf8')
            
            const logs = logString
                .split('\n')
                .filter(line => line.trim())
                .map(line => {
                    // Remove Docker's header bytes (8 bytes at the beginning of each log line)
                    // and strip ANSI color codes
                    return line.substring(8).replace(/\\x1B\[[0-9;]*[mGK]/g, '')
                })
            
            ctx.status = 200
            ctx.body = {logs}
        } catch (containerError) {
            log.warn(`Error getting logs for container ${containerInfo.id}: ${containerError.message}`)
            ctx.status = 200
            ctx.body = {logs: [`Failed to get logs: ${containerError.message}`]}
        }
    } catch (error) {
        log.error(`Error getting logs for ${appName}: ${error.message}`)
        ctx.status = 500
        ctx.body = {error: error.message || 'Unknown error'}
    }
}

const restartApp = async (appName, request, ctx) => {
    const appPath = `/var/lib/sepal/app-manager/apps/${appName}`
    const {forceRebuild} = request.query
    
    try {
        if (!fs.existsSync(appPath)) {
            ctx.status = 404
            ctx.body = {error: `App directory not found: ${appPath}`}
            return
        }

        const containerInfo = await getContainerInfo(appName)
        
        if (!containerInfo) {
            ctx.status = 404
            ctx.body = {error: 'No container found for this app'}
            return
        }
        
        if (forceRebuild === 'true') {
            // dockerode doesn't handle docker-compose building directly
            // TODO: this is not actually implemented yet, the arg is not passed
            const command = `cd ${appPath} && export GIT_COMMIT=$(git rev-parse HEAD) && docker compose --file "${appPath}/docker-compose.yml" build --build-arg GIT_COMMIT="$GIT_COMMIT" && docker compose up -d`
            await executeCommand(command)
        } else {
            const containerInstance = docker.getContainer(containerInfo.id)
            await containerInstance.restart()
        }
        
        ctx.status = 200
        ctx.body = {success: true}
    } catch (error) {
        log.error(`Error restarting ${appName}: ${error.message}`)
        ctx.status = 500
        ctx.body = {error: error.message || 'Unknown error'}
    }
}

const updateApp = async (appName, request, ctx) => {
    const appPath = `/var/lib/sepal/app-manager/apps/${appName}`
    
    try {
        if (!fs.existsSync(appPath)) {
            ctx.status = 404
            ctx.body = {error: `App directory not found: ${appPath}`}
            return
        }
        
        const gitInfo = await getGitInfo(appPath)
        
        if (gitInfo.updateAvailable) {
            log.info(`New commits detected for ${appName}, updating...`)
            
            // dockerode doesn't handle git operations or docker-compose directly
            const command = `cd ${appPath} && git pull && export GIT_COMMIT=$(git rev-parse HEAD) && docker compose --file "${appPath}/docker-compose.yml" build --build-arg GIT_COMMIT="$GIT_COMMIT" && docker compose up -d`
            
            await executeCommand(command)
            
            // Wait a moment for container to be up and get the updated status
            await new Promise(resolve => setTimeout(resolve, 2000))
            
            const containerData = await getContainerInfo(appName)
            
            ctx.status = 200
            ctx.body = {
                success: true,
                message: 'App updated successfully and rebuilt',
                updated: true,
                container: containerData
            }
        } else {
            const containerData = await getContainerInfo(appName)
            
            ctx.status = 200
            ctx.body = {
                success: true,
                message: 'No updates available',
                updated: false,
                container: containerData
            }
        }
    } catch (error) {
        log.error(`Error updating ${appName}: ${error.message}`)
        ctx.status = 500
        ctx.body = {error: error.message || 'Unknown error'}
    }
}

module.exports = {
    getAppStatus,
    getAppLogs,
    restartApp,
    updateApp
}
