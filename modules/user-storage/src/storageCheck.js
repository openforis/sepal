const {calculateUserStorage, scanUserHomes} = require('./filesystem')
const {redisHost, scanMinDelayMilliseconds, scanMaxDelayMilliseconds, scanDelayIncreaseFactor, scanConcurrency, scamMaxRetries, scanInitialRetryDelayMilliseconds} = require('./config')
const {getSessionStatus, getSetUserStorage, DB, getUserStorage} = require('./kvstore')
const Bull = require('bull')
const {v4: uuid} = require('uuid')
const {formatDistanceToNow} = require('date-fns')
const {Subject} = require('rxjs')
const log = require('#sepal/log').getLogger('storageCheck')

const MAX_RELATIVE_DELAY_SPREAD = .2

const SCHEDULE_OPTIONS = {
    'filesDeleted': {priority: 1, delay: 0},
    'sessionDeactivated': {priority: 2, delay: 0},
    'sessionActivated': {priority: 3, delay: 0},
    'initial': {priority: 6, delay: scanMinDelayMilliseconds},
    'periodic': {priority: 6, delay: scanMaxDelayMilliseconds}
}

const queue = new Bull('storage-check', {
    redis: {
        host: redisHost,
        db: DB.SCAN_QUEUE
    }
})

const scanComplete$ = new Subject()

const rescanJobId = (username, jobId = uuid()) =>
    `rescan-${username}-${jobId}`

const spreadDelay = delay =>
    Math.floor(delay * (1 + (Math.random() - .5) * 2 * MAX_RELATIVE_DELAY_SPREAD))

const increasingDelay = delay =>
    Math.max(Math.min(delay * scanDelayIncreaseFactor, scanMaxDelayMilliseconds), scanMinDelayMilliseconds)

const timeDistance = delay =>
    formatDistanceToNow(Date.now() + delay)

const logStats = async () =>
    log.isTrace() && log.trace('Stats:', [
        `active: ${await queue.getActiveCount()}`,
        `waiting: ${await queue.getWaitingCount()}`,
        `delayed: ${await queue.getDelayedCount()}`,
        `failed: ${await queue.getFailedCount()}`,
    ].join(', '))

queue.process(scanConcurrency, async job => {
    const {username} = job.data
    return {
        size: await calculateUserStorage(username)
    }
})

queue.on('error', error => log.error(error))

queue.on('failed', async (job, error) => {
    const {username} = job.data
    log.error(`Rescanning user ${username} failed:`, error)
})

queue.on('stalled', job => {
    const {username} = job.data
    log.warn(`Job stalled while rescanning user ${username}`, job)
})

queue.on('drained', async () => await logStats())

queue.on('completed', async (job, {size}) => {
    const {username} = job.data
    const workerSession = await getSessionStatus(username)
    const previousSize = await getSetUserStorage(username, size)
    const reschedule = async ({priority, delay}) =>
        await scheduleStorageCheck({
            username,
            priority,
            delay
        })
    if (workerSession) {
        await reschedule({
            priority: 3,
            delay: scanMinDelayMilliseconds
        })
    } else if (job.opts.delay < scanMaxDelayMilliseconds && job.opts.priority !== 6) {
        if (size !== previousSize) {
            await reschedule({
                priority: 4,
                delay: scanMinDelayMilliseconds
            })
        } else {
            await reschedule({
                priority: 5,
                delay: increasingDelay(job.opts.delay)
            })
        }
    } else {
        await reschedule({
            priority: 6,
            delay: scanMaxDelayMilliseconds
        })
    }

    scanComplete$.next({username, size})
})

const scheduleStorageCheck = async ({username, delay: nominalDelay = scanMaxDelayMilliseconds, priority = 1}) => {
    const delay = spreadDelay(nominalDelay)
    log.debug(`Scheduling check for user ${username} with priority ${priority} ${delay ? `in ${timeDistance(delay)}` : 'now'}`)
    await queue.removeJobs(rescanJobId(username, '*'))
    return await queue.add({username}, {
        jobId: rescanJobId(username),
        priority,
        delay,
        attempts: scamMaxRetries,
        backoff: {
            type: 'exponential',
            delay: scanInitialRetryDelayMilliseconds
        },
        removeOnComplete: 10,
        removeOnFail: 10
    })
}

const scheduleRescan = async ({username, type}) => {
    const {priority, delay} = SCHEDULE_OPTIONS[type]
    return await scheduleStorageCheck({username, priority, delay})
}

const scheduleFullStorageCheck = async () => {
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

module.exports = {scheduleFullStorageCheck, scheduleStorageCheck, scanComplete$, logStats}
