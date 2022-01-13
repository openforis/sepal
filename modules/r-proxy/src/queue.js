const {redisUri, httpPort, cranRepo, autoUpdateIntervalHours} = require('./config')
const Bull = require('bull')
const log = require('sepal/log').getLogger('queue')
const {makeBinaryPackage} = require('./R')
const {isUpdatable} = require('./filesystem')
const {checkUpdates} = require('./packages')

const queue = new Bull('build-queue', redisUri)

const QUEUE_OPTIONS = {
    removeOnComplete: true,
    attempts: 3,
    backoff: {
        type: 'exponential',
        delay: 3600e3
    }
}

const LOCAL_CRAN_REPO = `http://localhost:${httpPort}`

const logStats = async () =>
    log.isDebug() && log.debug([
        'Stats:',
        `active: ${await queue.getActiveCount()}`,
        `waiting: ${await queue.getWaitingCount()}`,
        `delayed: ${await queue.getDelayedCount()}`,
        `failed: ${await queue.getFailedCount()}`,
    ].join(', '))

queue.process(async ({data}) => {
    if (data.buildPackage) {
        return await buildPackage(data.buildPackage)
    }
    if (data.updatePackages) {
        return await updatePackages(data.updatePackages)
    }
    if (data.updatePackage) {
        return await updatePackage(data.updatePackage)
    }
    log.warn('Unsupported job:', data)
    return {success: true}
})

const buildPackage = async ({name, version}) => {
    log.debug(`Processing build:${name}/${version}`)
    const success = await makeBinaryPackage(name, version, LOCAL_CRAN_REPO)
    log.debug(`Processed build:${name}/${version}`)
    return {success}
}

const updatePackages = async () => {
    log.debug(`Processing update-packages`)
    await checkUpdates(enqueueUpdateBinaryPackage)
    log.debug(`Processed update-packages`)
    return {success: true}
}

const updatePackage = async ({name, version}) => {
    log.debug(`Processing update:${name}/${version}`)
    if (await isUpdatable(name, version)) {
        const success = await makeBinaryPackage(name, version, cranRepo)
        log.debug(`Processed update:${name}/${version}`)
        return {success}
    } else {
        log.debug(`Skipped update:${name}/${version}`)
        return {success: true}
    }
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

const enqueueBuildBinaryPackage = (name, version) => {
    const jobId = `build-package-${name}/${version}`
    log.debug(`Enqueuing job: ${jobId}`)
    return queue.add({buildPackage: {name, version}}, {
        ...QUEUE_OPTIONS,
        jobId,
        priority: 1
    })
}

const enqueueUpdateBinaryPackage = (name, version) => {
    const jobId = `update-package-${name}/${version}`
    log.debug(`Enqueuing job ${jobId}`)
    return queue.add({updatePackage: {name, version}}, {
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

module.exports = {enqueueBuildBinaryPackage, enqueueUpdateBinaryPackage, logStats, initQueue}
