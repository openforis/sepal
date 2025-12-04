const Bull = require('bull')
const {firstValueFrom} = require('rxjs')
const {formatDistance} = require('date-fns')
// const {eraseUserStorage} = require('./filesystem')
const {redisUri} = require('./config')
// const {sendEmail} = require('./email')
const {addEvent} = require('./database')
const {getMostRecentAccessByUser$, getMostRecentAccess$} = require('./http')
const {getUserStorage} = require('./kvstore')
const log = require('#sepal/log').getLogger('inactivityQueue')

const CONCURRENCY = 1
const MAX_RETRIES = 100
const INITIAL_RETRY_DELAY_MS = 60 * 1000 // 1 minute

// const INACTIVITY_TIMEOUT_MS = 365 * 24 * 60 * 60 * 1000 // 1 year
// const NOTIFICATION_DELAY_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
// const GRACE_PERIOD_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000 // 30 days
// const MAX_SPREAD_MS = 3 * 24 * 60 * 60 * 1000 // 3 days

const INACTIVITY_TIMEOUT_MS = 365 * 24 * 60 * 60 * 1000 // 1 year
const NOTIFICATION_DELAY_MS = 1 * 24 * 60 * 60 * 1000 // 1 days
const GRACE_PERIOD_TIMEOUT_MS = 1 * 24 * 60 * 60 * 1000 // 1 days
const MAX_SPREAD_MS = 3 * 60 * 60 * 1000 // 3 hours

// const INACTIVITY_TIMEOUT_MS = 30 * 1000
// const NOTIFICATION_DELAY_MS = 30 * 1000
// const GRACE_PERIOD_TIMEOUT_MS = 30 * 1000
// const MAX_SPREAD_MS = 0 * 1000

const USER_STORAGE_THRESHOLD_BYTES = 1 * 1024 * 1024 // 1 MB

const jobId = (username, action) =>
    `job-${username}-${action}`

const STORAGE = {
    INACTIVE_HIGH: Symbol('HIGH'),
    INACTIVE_LOW: Symbol('LOW'),
    INACTIVE_UNKNOWN: Symbol('UNKNOWN'),
    ACTIVE: Symbol('ACTIVE')
}

const isActive = async username => {
    const mostRecentTimestamp = await firstValueFrom(getMostRecentAccess$(username))
    return mostRecentTimestamp && relativeExpirationTime(mostRecentTimestamp) > 0
}

const getStorageStatus = async username => {
    if (await isActive(username)) {
        return STORAGE.ACTIVE
    } else {
        const userStorageSize = await getUserStorage(username)
        if (userStorageSize) {
            if (parseInt(userStorageSize) > USER_STORAGE_THRESHOLD_BYTES) {
                return STORAGE.INACTIVE_HIGH
            } else {
                return STORAGE.INACTIVE_LOW
            }
        } else {
            return STORAGE.INACTIVE_UNKNOWN
        }
    }
}

const markInactiveUser = async ({username}) => {
    switch (await getStorageStatus(username)) {
        case STORAGE.INACTIVE_HIGH:
            log.info(`Detected inactive user ${username} with significant storage`)
            await scheduleNotify({username})
            await addEvent({username, event: 'INACTIVE'})
            break
        case STORAGE.INACTIVE_LOW:
            log.info(`Detected inactive user ${username} with negligible storage, no action`)
            break
        case STORAGE.INACTIVE_UNKNOWN:
            log.info(`Detected inactive user ${username} with unknown storage, will retry`)
            throw new Error(`Unknown storage size for user ${username}`)
        case STORAGE.ACTIVE:
            break
    }
}

const notifyInactiveUser = async ({username}) => {
    switch (await getStorageStatus(username)) {
        case STORAGE.INACTIVE_HIGH:
            log.info(`User ${username} still inactive with significant storage, sending notification email [DRY RUN]`)
            // log.info(`User ${username} still inactive with significant storage, sending notification email`)
            // await sendEmail({username, subject: 'Inactivity notification', content: 'Due to long inactivity, your storage will be erased soon.'})

            await scheduleErase({username})
            await addEvent({username, event: 'NOTIFIED'})
            break
        case STORAGE.INACTIVE_LOW:
            log.info(`User ${username} still inactive but with negligible storage, not sending notification email`)
            break
        case STORAGE.INACTIVE_UNKNOWN:
            log.info(`User ${username} still inactive but with unknown storage, will retry`)
            throw new Error(`Unknown storage size for user ${username}`)
        case STORAGE.ACTIVE:
            log.info(`User ${username} now active, not sending notification email`)
            break
    }
}

const eraseInactiveUserStorage = async ({username}) => {
    switch (await getStorageStatus(username)) {
        case STORAGE.INACTIVE_HIGH:
            log.info(`User ${username} still inactive with significant storage, erasing storage [DRY RUN]`)
            // log.info(`User ${username} still inactive with significant storage, erasing storage`)
            // await eraseUserStorage(username)

            await addEvent({username, event: 'ERASED'})
            break
        case STORAGE.INACTIVE_LOW:
            log.info(`User ${username} still inactive but with negligible storage, not erasing storage`)
            break
        case STORAGE.INACTIVE_UNKNOWN:
            log.info(`User ${username} still inactive but with unknown storage, will retry`)
            throw new Error(`Unknown storage size for user ${username}`)
        case STORAGE.ACTIVE:
            log.info(`User ${username} now active, not erasing storage`)
            break
    }
}

const queue = new Bull('inactivity-queue', redisUri)

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
        case 'mark':
            return await markInactiveUser({username})
        case 'notify':
            return await notifyInactiveUser({username})
        case 'erase':
            return await eraseInactiveUserStorage({username})
        default:
            throw new Error(`Unknown action: ${action}`)
    }
})

queue.on('error', error => {
    log.error(error)
})

// queue.on('failed', async (job, error) => {
//     const {username, action} = job.data
//     log.error(`Job failed for user ${username} while performing action ${action}:`, error)
// })

queue.on('stalled', job => {
    const {username} = job.data
    log.warn(`Job stalled while rescanning user ${username}`, job)
})

queue.on('drained', async () => await logStats())

queue.on('completed', async (job, _result) => {
    const {username, action} = job.data
    log.debug(`Completed job for user ${username}, action: ${action}`)
})

const scheduleMark = async ({username, delay = INACTIVITY_TIMEOUT_MS}) => {
    log.debug(`Scheduling inactive state for user ${username} ${delay ? `in ${formatDistance(0, delay, {includeSeconds: true})}` : 'now'}`)
    return schedule({username, delay, action: 'mark'})
}

const scheduleNotify = async ({username, delay = NOTIFICATION_DELAY_MS}) => {
    log.debug(`Scheduling inactivity notification for user ${username} ${delay ? `in ${formatDistance(0, delay, {includeSeconds: true})}` : 'now'}`)
    return schedule({username, delay, action: 'notify'})
}

const scheduleErase = async ({username, delay = GRACE_PERIOD_TIMEOUT_MS}) => {
    log.debug(`Scheduling inactivity storage erase for user ${username} ${delay ? `in ${formatDistance(0, delay, {includeSeconds: true})}` : 'now'}`)
    await queue.removeJobs(jobId(username, '*'))
    return schedule({username, delay, action: 'erase'})
}

const schedule = async ({username, delay, action}) =>
    await queue.add({username, action}, {
        jobId: jobId(username, action),
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

// positive: future, negative: past
const relativeExpirationTime = mostRecentTimestamp =>
    mostRecentTimestamp.getTime() + INACTIVITY_TIMEOUT_MS - Date.now()

const getDelay = (mostRecentTimestamp = new Date()) =>
    Math.max(0, relativeExpirationTime(mostRecentTimestamp)) + Math.random() * MAX_SPREAD_MS

const initializeInactivityCheck = async ({username, mostRecentTimestamp}) => {
    if (!await queue.getJob(jobId(username, 'mark')) && !await queue.getJob(jobId(username, 'notify')) && !await queue.getJob(jobId(username, 'erase'))) {
        await scheduleMark({username, delay: getDelay(mostRecentTimestamp)})
    }
}

const scheduleInactivityCheck = async ({username}) => {
    await queue.removeJobs(jobId(username, '*'))
    await scheduleMark({username, delay: getDelay()})
}

const cancelInactivityCheck = async ({username}) => {
    log.debug(`Clearing inactivity jobs for user ${username}`)
    await queue.removeJobs(jobId(username, '*'))
    await addEvent({username, event: 'ACTIVE'})
}

const scheduleFullInactivityCheck = async () => {
    log.debug('Scheduling inactivity check for all users...')
    const userActivity = await firstValueFrom(getMostRecentAccessByUser$())

    await queue.pause()
    await queue.obliterate()
    await queue.resume()

    const {activeUsers, inactiveUsers} = Object.entries(userActivity)
        .reduce((acc, [username, mostRecentTimestamp]) => {
            acc.now - mostRecentTimestamp.getTime() < INACTIVITY_TIMEOUT_MS
                ? acc.activeUsers.push({username, mostRecentTimestamp})
                : acc.inactiveUsers.push({username, mostRecentTimestamp})
            return acc
        }, {activeUsers: [], inactiveUsers: [], now: Date.now()})

    Object.entries(userActivity).forEach(([username, mostRecentTimestamp]) => {
        initializeInactivityCheck({username, mostRecentTimestamp})
    })
    log.info('Scheduled inactivity check for all users')
}

module.exports = {scheduleFullInactivityCheck, scheduleInactivityCheck, cancelInactivityCheck, logStats}
