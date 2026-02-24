const {Redis} = require('ioredis')
const {Queue, QueueEvents, Worker, Job} = require('bullmq')
const {platformVersion, redisHost, autoUpdateIntervalHours, updateNow, LOCAL_CRAN_REPO} = require('./config')
const log = require('#sepal/log').getLogger('queue')
const {makeCranPackage, checkCranUpdates, updateCranPackage} = require('./cran')
const {makeGitHubPackage, checkGitHubUpdates, updateGitHubPackage} = require('./github')

const QUEUE = `build-queue-${platformVersion}`

const QUEUE_OPTIONS = {
    removeOnComplete: true,
    attempts: 3,
    backoff: {
        type: 'exponential',
        delay: 3600e3
    }
}

const connection = new Redis({
    host: redisHost,
    db: 1,
    maxRetriesPerRequest: null
})

const queue = new Queue(QUEUE, {
    connection
})

const queueEvents = new QueueEvents(QUEUE, {
    connection
})

const logStats = async () =>
    log.isDebug() && log.debug([
        'Stats:',
        `active: ${await queue.getActiveCount()}`,
        `waiting: ${await queue.getWaitingCount()}`,
        `delayed: ${await queue.getDelayedCount()}`,
        `failed: ${await queue.getFailedCount()}`,
    ].join(', '))

const buildCranPackage = async ({name, path, version}) => {
    log.debug(`Processing build/CRAN: ${name}/${version}`)
    const success = await makeCranPackage({name, path, version, repo: LOCAL_CRAN_REPO})
    log.debug(`Processed build/CRAN: ${name}/${version}`)
    return {success}
}

const buildGitHubPackage = async ({name, path}) => {
    log.debug(`Processing build/GitHub: ${path}`)
    const success = await makeGitHubPackage({name, path})
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

queueEvents.on('error', error =>
    log.error(error)
)

queueEvents.on('failed', async ({jobId, failedReason}) => {
    const job = await Job.fromId(queue, jobId)
    if (job) {
        const {name, version} = job.data
        log.error(`Rescanning ${name}/${version} failed:`, failedReason)
    } else {
        log.error(`Job ${jobId} failed:`, failedReason)
    }
})

queueEvents.on('stalled', async ({jobId}) => {
    const job = await Job.fromId(queue, jobId)
    if (job) {
        const {name, version} = job.data
        log.warn(`Job stalled while rescanning ${name}/${version}`)
    } else {
        log.warn(`Job ${jobId} stalled`)
    }
})

queueEvents.on('drained', async () =>
    await logStats()
)

queueEvents.on('completed', async ({jobId}) => {
    log.debug(`Completed job ${jobId}`)
})

const enqueueBuildCranPackage = (name, path, version) => {
    const jobId = `build-cran-package-${name}/${version}`
    log.debug(`Enqueuing job: ${jobId}`)
    return queue.add(jobId, {buildCranPackage: {name, path, version}}, {
        ...QUEUE_OPTIONS,
        jobId,
        priority: 1
    })
}

const enqueueBuildGitHubPackage = (name, path) => {
    const jobId = `build-github-package-${name}/${path}`
    log.debug(`Enqueuing job: ${jobId}`)
    return queue.add(jobId, {buildGitHubPackage: {name, path}}, {
        ...QUEUE_OPTIONS,
        jobId,
        priority: 1
    })
}

const enqueueUpdateCranPackage = (name, version) => {
    const jobId = `update-cran-package-${name}/${version}`
    log.debug(`Enqueuing job ${jobId}`)
    return queue.add(jobId, {updateCranPackage: {name, version}}, {
        ...QUEUE_OPTIONS,
        jobId,
        priority: 2
    })
}

const enqueueUpdateGitHubPackage = (name, path) => {
    const jobId = `update-github-package-${path}`
    log.debug(`Enqueuing job ${jobId}`)
    return queue.add(jobId, {updateGitHubPackage: {name, path}}, {
        ...QUEUE_OPTIONS,
        jobId,
        priority: 2
    })
}

const enqueueUpdateBinaryPackages = updateNow => {
    const jobId = 'update-packages'
    log.debug(`Enqueuing job ${jobId}`)
    return queue.add(jobId, {updatePackages: {}}, {
        jobId,
        priority: 3,
        repeat: updateNow ? null : {
            every: autoUpdateIntervalHours * 3600e3
        },
        removeOnComplete: true
    })
}

const processJob = async ({data}) => {
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
}

const initQueue = async () => {
    await queue.obliterate({force: true})
    log.debug('Queue obliterated')
    log.info(`Scheduling automatic package update every ${autoUpdateIntervalHours} hours`)
    enqueueUpdateBinaryPackages()
    if (updateNow) {
        enqueueUpdateBinaryPackages(true)
    }

    await logStats()

    new Worker(QUEUE, processJob, {
        connection,
        concurrency: 1
    })
}

module.exports = {enqueueBuildCranPackage, enqueueBuildGitHubPackage, initQueue}
