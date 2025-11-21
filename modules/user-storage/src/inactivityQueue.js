const Bull = require('bull')
const {Subject} = require('rxjs')
const {formatDistance} = require('date-fns')
// const {eraseUserStorage} = require('./filesystem')
const {redisUri} = require('./config')
// const {sendEmail} = require('./email')
const {addEvent} = require('./database')
const log = require('#sepal/log').getLogger('inactivityQueue')

const CONCURRENCY = 1
const MAX_RETRIES = 10
const INITIAL_RETRY_DELAY_MS = 60 * 1000 // 1 minute

const INACTIVITY_TIMEOUT_MS = 365 * 24 * 60 * 60 * 1000 // 1 year
// const GRACE_PERIOD_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
// const MAX_SPREAD_MS = 3 * 24 * 60 * 60 * 1000 // 3 days
const GRACE_PERIOD_TIMEOUT_MS = 60 * 60 * 1000 // 3 hour
const MAX_SPREAD_MS = 60 * 60 * 1000 // 1 hour

// const INACTIVITY_TIMEOUT_MS = 1 * 60 * 1000 // 1 minute
// const GRACE_PERIOD_TIMEOUT_MS = 30 * 1000 // 30 seconds
// const MAX_SPREAD_MS = 120 * 1000 // 15 seconds

const jobId = (username, action) =>
    `job-${username}-${action}`

const notifyInactiveUser = async ({username}) => {
    log.info(`Notifying inactive user ${username} - DRY-RUN, NO EMAIL SENT`)
    // log.info(`Notifying inactive user ${username}`)
    // await sendEmail({username, subject: 'Inactivity notification', content: 'Due to long inactivity, your storage will be erased soon.'})
    await scheduleErase({username})
    await addEvent({username, event: 'NOTIFIED'})
}

const eraseInactiveUserStorage = async ({username}) => {
    log.info(`Erasing storage of inactive user ${username} - DRY-RUN, STORAGE NOT ERASED`)
    // log.info(`Erasing storage of inactive user ${username}`)
    // await eraseUserStorage(username)
    await addEvent({username, event: 'ERASED'})
}

const queue = new Bull('inactivity-queue', redisUri)

const complete$ = new Subject()

const logStats = async () =>
    log.isTrace() && log.trace('Stats:', [
        `active: ${await queue.getActiveCount()}`,
        `waiting: ${await queue.getWaitingCount()}`,
        `delayed: ${await queue.getDelayedCount()}`,
        `failed: ${await queue.getFailedCount()}`,
    ].join(', '))

queue.process(CONCURRENCY, async job => {
    const {username, action} = job.data
    switch (action) {
        case 'notify':
            return await notifyInactiveUser({username})
        case 'erase':
            return await eraseInactiveUserStorage({username})
        default:
            throw new Error(`Unknown action: ${action}`)
    }
})

queue.on('error', error => log.error(error))

queue.on('failed', async (job, error) => {
    const {username, action} = job.data
    log.error(`Job failed for user ${username} while performing action ${action}:`, error)
})

queue.on('stalled', job => {
    const {username} = job.data
    log.warn(`Job stalled while rescanning user ${username}`, job)
})

queue.on('drained', async () => await logStats())

// queue.on('completed', async (job, {size}) => {
queue.on('completed', async (job, _result) => {
    const {username, action} = job.data
    log.debug(`Completed job for user ${username}, action: ${action}`)
    complete$.next({username})
})

const scheduleNotify = async ({username, delay = INACTIVITY_TIMEOUT_MS}) => {
    log.debug(`Scheduling inactivity notification for user ${username} ${delay ? `in ${formatDistance(0, delay, {includeSeconds: true})}` : 'now'}`)
    await queue.add({username, action: 'notify'}, {
        jobId: jobId(username, 'notify'),
        priority: 1,
        delay,
        attempts: MAX_RETRIES,
        backoff: {
            type: 'exponential',
            delay: INITIAL_RETRY_DELAY_MS
        },
        removeOnComplete: 10,
        removeOnFail: 100
    })
}

const scheduleErase = async ({username, delay = GRACE_PERIOD_TIMEOUT_MS}) => {
    log.debug(`Scheduling inactivity storage erase for user ${username} ${delay ? `in ${formatDistance(0, delay, {includeSeconds: true})}` : 'now'}`)
    await queue.removeJobs(jobId(username, '*'))
    return await queue.add({username, action: 'erase'}, {
        jobId: jobId(username, 'erase'),
        priority: 1,
        delay,
        attempts: MAX_RETRIES,
        backoff: {
            type: 'exponential',
            delay: INITIAL_RETRY_DELAY_MS
        },
        removeOnComplete: 10,
        removeOnFail: 100
    })
}

const getDelay = (mostRecentTimestamp = new Date()) =>
    Math.max(0, mostRecentTimestamp.getTime() + INACTIVITY_TIMEOUT_MS - Date.now()) + Math.random() * MAX_SPREAD_MS

const scheduleInactivityCheck = async ({username, mostRecentTimestamp}) => {
    if (mostRecentTimestamp) {
        if (!await queue.getJob(jobId(username, 'notify')) && !await queue.getJob(jobId(username, 'erase'))) {
            await scheduleNotify({username, delay: getDelay(mostRecentTimestamp)})
        }
    } else {
        await queue.removeJobs(jobId(username, '*'))
        await scheduleNotify({username, delay: getDelay(mostRecentTimestamp)})
    }
}

const cancelInactivityCheck = async ({username}) => {
    log.debug(`Clearing inactivity jobs for user ${username}`)
    await queue.removeJobs(jobId(username, '*'))
    await addEvent({username, event: 'ACTIVE'})
}

module.exports = {scheduleInactivityCheck, cancelInactivityCheck, complete$, logStats}
