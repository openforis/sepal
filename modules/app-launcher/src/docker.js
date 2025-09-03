const fs = require('fs').promises
const path = require('path')
const Docker = require('dockerode')
const log = require('#sepal/log').getLogger('appsService')
const executeCommand = require('./terminal')
const {getCurrentCommitHash} = require('./git')

const getAppPath = appName => `/var/lib/sepal/app-manager/apps/${appName}`

const docker = new Docker()

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 5000

const pathExists = async filepath => {
    try {
        await fs.access(filepath)
        return true
    } catch {
        return false
    }
}
const execOptions = appPath => ({cwd: appPath})

const buildDockerCommand = async (appPath, additionalCommands = '') => {
    const gitCommit = await getCurrentCommitHash(appPath)
    const composeFilesStr = await composeFiles(appPath)
    return `export GIT_COMMIT=${gitCommit} && docker compose ${composeFilesStr} build --build-arg GIT_COMMIT="${gitCommit}"${additionalCommands ? ' && ' + additionalCommands : ''}`
}

const composeFiles = async (appPath, includeOverride = true) => {
    const files = [path.join(appPath, 'docker-compose.yml')]
    if (
        includeOverride &&
    process.env.DEPLOY_ENVIRONMENT === 'DEV' &&
    await pathExists(path.join(appPath, 'docker-compose.override.yml'))
    ) {
        files.push(path.join(appPath, 'docker-compose.override.yml'))
    }
    return files.map(f => `--file ${f}`).join(' ')
}

const cleanupAppImages = async (appName, repository) => {
    try {
        log.info(`Cleaning up old images for app ${appName}...`)
        const pruneCommand = `docker image prune -f --filter "label=org.opencontainers.image.source=${repository}"`
        await executeCommand(pruneCommand, {})
        log.info(`Cleaned up old images for app ${appName}`)
    } catch (error) {
        log.warn(`Failed to cleanup images for app ${appName}: ${error.message}`)
    }
}

const buildAndRestart = async (appName, repository) => {
    const appPath = getAppPath(appName)
    let attempt = 1
    while (attempt <= MAX_RETRIES) {
        try {
            log.info(`Building Docker image for ${appName} (Attempt ${attempt})...`)
            const command = await buildDockerCommand(appPath)
            await executeCommand(command, execOptions(appPath))
            log.info('Docker image built successfully')
            
            if (repository) {
                await cleanupAppImages(appName, repository)
            }
            
            await startContainer(appName)
            return
        } catch (error) {
            log.error(`Build attempt ${attempt} failed: ${error.message}`)
            if (attempt === MAX_RETRIES) {
                throw new Error(`Failed to build Docker image after ${MAX_RETRIES} attempts: ${error.message}`)
            }
            attempt++
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS))
        }
    }
}

const startContainer = async appName => {
    const appPath = getAppPath(appName)
    
    try {
        log.info(`Starting ${appName} container...`)
        const composeFilesStr = await composeFiles(appPath)
        const upCommand = `docker compose ${composeFilesStr} up -d`
        await executeCommand(upCommand, execOptions(appPath))
        
        const containerRunning = await isContainerRunning(appName)
        if (!containerRunning) {
            throw new Error('Container is not running as expected after startup')
        }
        log.info('Container started successfully')
    } catch (error) {
        log.error(`Failed to start container for ${appName}: ${error.message}`)
        throw error
    }
}

const isContainerRunning = async appName => {
    try {
        const {containerInstance} = await getContainerInstance(appName)
        const inspectData = await containerInstance.inspect()
        return inspectData.State.Status === 'running'
    } catch (error) {
        if (error.message.includes('Container not found')) {
            return false
        }
        log.error(`Failed to check if container is running: ${error.message}`)
        return false
    }
}

const getContainerStats = async containerId => {
    try {
        const containerInstance = docker.getContainer(containerId)
        const stats = await containerInstance.stats({stream: false})
        
        const {memory_stats: {usage: memoryUsage, limit: memoryLimit}} = stats
        
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
        const {
            cpu_stats: {
                cpu_usage: {total_usage: currentCpuUsage},
                system_cpu_usage: currentSystemUsage,
                online_cpus: cpuCount
            },
            precpu_stats: {
                cpu_usage: {total_usage: prevCpuUsage},
                system_cpu_usage: prevSystemUsage
            }
        } = stats
        
        const cpuDelta = currentCpuUsage - prevCpuUsage
        const systemDelta = currentSystemUsage - prevSystemUsage
        const actualCpuCount = cpuCount || stats.cpu_stats.cpu_usage.percpu_usage?.length || 1
        
        if (systemDelta > 0 && cpuDelta > 0) {
            const cpuPercent = ((cpuDelta / systemDelta) * actualCpuCount * 100).toFixed(2)
            return `${cpuPercent}%`
        }
        return '0.00%'
    } catch (error) {
        log.warn(`Error calculating CPU percentage: ${error.message}`)
        return 'N/A'
    }
}

const getContainerInstance = async appName => {
    try {
        const containers = await docker.listContainers({
            all: true,
            filters: JSON.stringify({
                name: [`/${appName}`],
            })
        })
        
        if (!containers || containers.length === 0) {
            throw new Error(`Container not found for app: ${appName}`)
        }
        
        const containerId = containers[0].Id
        
        return {
            containerId,
            containerInstance: docker.getContainer(containerId)
        }
    } catch (error) {
        log.error(`Failed to get container instance for app ${appName}: ${error.message}`)
        throw error
    }
}

const getContainerInfo = async appName => {
    try {
        const {containerId, containerInstance} = await getContainerInstance(appName)
        const inspectData = await containerInstance.inspect()
            
        const containerInfo = {
            id: containerId.substring(0, 12),
            names: inspectData.Name ? [inspectData.Name] : [inspectData.Name],
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
    } catch (error) {
        // If container not found, return null
        if (error.message.includes('Container not found')) {
            return null
        }
        throw error
    }
}

const restartContainer = async appName => {
    try {
        log.info(`Restarting container for app: ${appName}`)
        const {containerId, containerInstance} = await getContainerInstance(appName)
        
        await containerInstance.restart()
        
        log.info(`Container ${containerId.substring(0, 12)} restarted successfully`)
        return {success: true, containerId: containerId.substring(0, 12)}
    } catch (error) {
        log.error(`Failed to restart container for app ${appName}: ${error.message}`)
        throw error
    }
}

const getContainerLogs = async (appName, options = {}) => {
    try {
        const {lines = 50} = options
        
        try {
            const {containerInstance} = await getContainerInstance(appName)
            
            const logOptions = {
                stdout: true,
                stderr: true,
                tail: lines,
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
            
            return logs
        } catch (error) {
            if (error.message.includes('Container not found')) {
                return ['No container found for this app']
            }
            throw error
        }
    } catch (error) {
        log.error(`Failed to get container logs for app ${appName}: ${error.message}`)
        throw error
    }
}

module.exports = {
    pathExists,
    isContainerRunning,
    startContainer,
    restartContainer,
    getContainerInfo,
    getContainerLogs,
    buildAndRestart,
}
