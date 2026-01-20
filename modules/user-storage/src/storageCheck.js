const {calculateUserStorage, scanUserHomes} = require('./filesystem')
const {redisHost, scanMinDelay, scanMaxDelay, scanDelayIncreaseFactor, scanConcurrency, scanMaxRetries, scanInitialRetryDelay} = require('./config')
const {getSessionStatus, getSetUserStorage, DB, getUserStorage} = require('./kvstore')
const {Queue, QueueEvents, Worker, Job} = require('bullmq')
const {formatDistanceToNow} = require('date-fns')
const {Subject} = require('rxjs')
const {Redis} = require('ioredis')
const log = require('#sepal/log').getLogger('storageCheck')

const QUEUE = 'storage-check'

const MAX_RELATIVE_DELAY_SPREAD = .2

const SCHEDULE_OPTIONS = {
    'filesDeleted': {priority: 1, delay: 0},
    'sessionDeactivated': {priority: 2, delay: 0},
    'sessionActivated': {priority: 3, delay: 0},
    'initial': {priority: 6, delay: scanMinDelay},
    'periodic': {priority: 6, delay: scanMaxDelay}
}

const connection = new Redis({
    host: redisHost,
    db: DB.SCAN_QUEUE,
    maxRetriesPerRequest: null
})

const queue = new Queue(QUEUE, {
    connection
})

const queueEvents = new QueueEvents(QUEUE, {
    connection
})

const scanComplete$ = new Subject()

const jobId = username =>
    `job-${username}`

const spreadDelay = delay =>
    Math.floor(delay * (1 + (Math.random() - .5) * 2 * MAX_RELATIVE_DELAY_SPREAD))

const increasingDelay = delay =>
    Math.max(Math.min(delay * scanDelayIncreaseFactor, scanMaxDelay), scanMinDelay)

const timeDistance = delay =>
    formatDistanceToNow(Date.now() + delay)

queueEvents.on('error', error =>
    log.error(error)
)

queueEvents.on('completed', async ({jobId, returnvalue: {size}}) => {
    const job = await Job.fromId(queue, jobId)
    const {username} = job.data
    const workerSession = await getSessionStatus(username)
    const previousSize = await getSetUserStorage(username, size)

    if (workerSession) {
        await scheduleStorageCheck({
            username,
            priority: 3,
            delay: scanMinDelay
        })
    } else if (job.opts.delay < scanMaxDelay && job.opts.priority !== 6) {
        if (size !== previousSize) {
            await scheduleStorageCheck({
                username,
                priority: 4,
                delay: scanMinDelay
            })
        } else {
            await scheduleStorageCheck({
                username,
                priority: 5,
                delay: increasingDelay(job.opts.delay)
            })
        }
    } else {
        await scheduleStorageCheck({
            username,
            priority: 6,
            delay: scanMaxDelay
        })
    }

    scanComplete$.next({username, size})
})

queueEvents.on('failed', async ({jobId, failedReason}) =>
    log.error(`Job ${jobId} failed:`, failedReason)
)

queueEvents.on('stalled', ({jobId}) =>
    log.warn(`Job ${jobId} stalled`)
)

const scheduleStorageCheck = async ({username, delay: nominalDelay = scanMaxDelay, priority = 1}) => {
    const delay = spreadDelay(nominalDelay)
    log.debug(`Scheduling check for user ${username} with priority ${priority} ${delay ? `in ${timeDistance(delay)}` : 'now'}`)
    // await queue.removeJobs(rescanJobId(username, '*'))
    await queue.remove(jobId(username))
    return await queue.add('rescan', {username}, {
        jobId: jobId(username),
        priority,
        delay,
        attempts: scanMaxRetries,
        backoff: {
            type: 'exponential',
            delay: scanInitialRetryDelay
        },
        removeOnComplete: 10,
        removeOnFail: 100
    })
}

const scheduleRescan = async ({username, type}) => {
    const {priority, delay} = SCHEDULE_OPTIONS[type]
    return await scheduleStorageCheck({username, priority, delay})
}

const scheduleFullCheck = async () => {
    log.debug('Scheduling check for all users')
    await scanUserHomes(
        async username => {
            const size = await getUserStorage(username)
            if (size) {
                await scheduleRescan({username, type: 'periodic'})
            } else {
                await scheduleRescan({username, type: 'initial'})
            }
        }
    )
    log.info('Scheduled check for all users')
}

const processJob = async job => {
    const {username} = job.data
    return {
        size: await calculateUserStorage(username)
    }
}

const startStorageCheck = async () => {
    log.info('Starting storage check processor')
    await scheduleFullCheck()
    
    new Worker(QUEUE, processJob, {
        connection,
        concurrency: scanConcurrency
    })
}

module.exports = {scheduleStorageCheck, scanComplete$, startStorageCheck}
