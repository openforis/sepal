const {calculateUserStorage} = require('./filesystem')
const {redisUri, scanMinDelayMilliseconds, scanMaxDelayMilliseconds, scanDelayIncreaseFactor, scanConcurrency, scamMaxRetries, scanInitialRetryDelayMilliseconds} = require('./config')
const {getSessionStatus, getSetUserStorage} = require('./kvstore')
const Bull = require('bull')
const {v4: uuid} = require('uuid')
const {formatDistanceToNow} = require('date-fns')
const {Subject} = require('rxjs')
const log = require('#sepal/log').getLogger('scanQueue')

const DELAY_SPREAD = .2

const queue = new Bull('scan-queue', redisUri)

const scanComplete$ = new Subject()

const rescanJobId = (username, jobId = uuid()) =>
    `rescan-${username}-${jobId}`

const spreadDelay = delay =>
    Math.floor(delay * (1 + (Math.random() - .5) * 2 * DELAY_SPREAD))

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
        await scan({
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

const scan = async ({username, delay: nominalDelay = scanMaxDelayMilliseconds, priority = 1}) => {
    const delay = spreadDelay(nominalDelay)
    log.debug(`Rescanning user ${username} with priority ${priority} ${delay ? `in ${timeDistance(delay)}` : 'now'}`)
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

module.exports = {scan, scanComplete$, logStats}
