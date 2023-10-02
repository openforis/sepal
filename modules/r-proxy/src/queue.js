const {platformVersion, redisUri, autoUpdateIntervalHours, LOCAL_CRAN_REPO} = require('./config')
const Bull = require('bull')
const log = require('#sepal/log').getLogger('queue')
const {makeCranPackage, checkCranUpdates, updateCranPackage} = require('./cran')
const {makeGitHubPackage, checkGitHubUpdates, updateGitHubPackage} = require('./github')
// const {checkCranUpdates, checkGitHubUpdates} = require('./update')

const queue = new Bull(`build-queue-${platformVersion}`, redisUri)

const QUEUE_OPTIONS = {
    removeOnComplete: true,
    attempts: 3,
    backoff: {
        type: 'exponential',
        delay: 3600e3
    }
}

const logStats = async () =>
    log.isDebug() && log.debug([
        'Stats:',
        `active: ${await queue.getActiveCount()}`,
        `waiting: ${await queue.getWaitingCount()}`,
        `delayed: ${await queue.getDelayedCount()}`,
        `failed: ${await queue.getFailedCount()}`,
    ].join(', '))

queue.process(async ({data}) => {
    if (data.buildCranPackage) {
        return await buildCranPackage(data.buildCranPackage)
    }
    if (data.buildGitHubPackage) {
        return await buildGitHubPackage(data.buildGitHubPackage)
    }
    if (data.updatePackages) {
        return await updatePackages(data.updatePackages)
    }
    if (data.updateCranPackage) {
        return await updateCranPackage(data.updateCranPackage)
    }
    if (data.updateGitHubPackage) {
        return await updateGitHubPackage(data.updateGitHubPackage)
    }
    log.warn('Unsupported job:', data)
    return {success: true}
})

const buildCranPackage = async ({name, version}) => {
    log.debug(`Processing build/CRAN: ${name}/${version}`)
    const success = await makeCranPackage(name, version, LOCAL_CRAN_REPO)
    log.debug(`Processed build/CRAN: ${name}/${version}`)
    return {success}
}

const buildGitHubPackage = async ({name, path}) => {
    log.debug(`Processing build/GitHub: ${path}`)
    const success = await makeGitHubPackage(name, path, LOCAL_CRAN_REPO)
    log.debug(`Processed build/GitHub: ${path}`)
    return {success}
}

const updatePackages = async () => {
    log.debug('Processing update-packages')
    await checkCranUpdates(enqueueUpdateCranPackage)
    await checkGitHubUpdates(enqueueUpdateGitHubPackage)
    log.debug('Processed update-packages')
    return {success: true}
}

queue.on('error', error => log.error(error))

queue.on('failed', (job, error) => {
    const {name, version} = job.data
    log.error(`Rescanning ${name}/${version} failed:`, error)
})

queue.on('stalled', job => {
    const {name, version} = job.data
    log.warn(`Job stalled while rescanning ${name}/${version}`)
})

queue.on('drained', async () =>
    await logStats()
)

queue.on('completed', async ({id}, {success}) => {
    if (success) {
        log.debug(`Completed job ${id}`)
    } else {
        log.warn(`Failed job ${id}`)
    }
})

const enqueueBuildCranPackage = (name, version) => {
    const jobId = `build-cran-package-${name}/${version}`
    log.debug(`Enqueuing job: ${jobId}`)
    return queue.add({buildCranPackage: {name, version}}, {
        ...QUEUE_OPTIONS,
        jobId,
        priority: 1
    })
}

const enqueueBuildGitHubPackage = (name, path) => {
    const jobId = `build-github-package-${name}/${path}`
    log.debug(`Enqueuing job: ${jobId}`)
    return queue.add({buildGitHubPackage: {name, path}}, {
        ...QUEUE_OPTIONS,
        jobId,
        priority: 1
    })
}

const enqueueUpdateCranPackage = (name, version) => {
    const jobId = `update-cran-package-${name}/${version}`
    log.debug(`Enqueuing job ${jobId}`)
    return queue.add({updateCranPackage: {name, version}}, {
        ...QUEUE_OPTIONS,
        jobId,
        priority: 2
    })
}

const enqueueUpdateGitHubPackage = (name, path) => {
    const jobId = `update-github-package-${path}`
    log.debug(`Enqueuing job ${jobId}`)
    return queue.add({updateGitHubPackage: {name, path}}, {
        ...QUEUE_OPTIONS,
        jobId,
        priority: 2
    })
}

const enqueueUpdateBinaryPackages = () => {
    const jobId = 'update-packages'
    log.debug(`Enqueuing job ${jobId}`)
    return queue.add({updatePackages: {}}, {
        jobId,
        priority: 3,
        repeat: {
            every: autoUpdateIntervalHours * 3600e3
        },
        removeOnComplete: true
    })
}

const initQueue = async () => {
    await queue.obliterate({force: true})
    log.debug('Queue obliterated')
    log.info(`Scheduling automatic package update every ${autoUpdateIntervalHours} hours`)
    enqueueUpdateBinaryPackages()
}

module.exports = {enqueueBuildCranPackage, enqueueBuildGitHubPackage, logStats, initQueue}
