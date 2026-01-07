const Bull = require('bull')
const {firstValueFrom} = require('rxjs')
const {formatDistance} = require('date-fns')
// const {eraseUserStorage} = require('./filesystem')
const {redisHost, inactivityTimeout, inactivityNotificationDelay, inactivityGracePeriodTimeout, inactivityMaxSpread} = require('./config')
// const {sendEmail} = require('./email')
const {addEvent} = require('./database')
const {getMostRecentAccessByUser$, getMostRecentAccess$} = require('./http')
const {getUserStorage, DB, getInitialized, setInitialized} = require('./kvstore')
const log = require('#sepal/log').getLogger('inactivityCheck')

const CONCURRENCY = 1
const MAX_RETRIES = 100
const INITIAL_RETRY_DELAY_MS = 60 * 1000 // 1 minute

const USER_STORAGE_THRESHOLD_BYTES = 1 * 1024 * 1024 // 1 MB

const queue = new Bull('inactivity-check', {
    redis: {
        host: redisHost,
        db: DB.INACTIVITY_QUEUE
    }
})

const jobId = (username, action) =>
    `job-${username}-${action}`

const STORAGE = {
    INACTIVE_HIGH: Symbol('INACTIVE_HIGH'),
    INACTIVE_LOW: Symbol('INACTIVE_LOW'),
    INACTIVE_UNKNOWN: Symbol('INACTIVE_UNKNOWN'),
    ACTIVE: Symbol('ACTIVE')
}

const mark = async ({username}) => {
    log.info(`Detected inactive user ${username} with significant storage`)
}

const notify = async username => {
    log.info(`User ${username} still inactive with significant storage, sending notification email [DRY RUN]`)
    // log.info(`User ${username} still inactive with significant storage, sending notification email`)
    // await sendEmail({username, subject: 'Inactivity notification', content: 'Due to long inactivity, your storage will be erased soon.'})
}

const erase = async username => {
    log.info(`User ${username} still inactive with significant storage, erasing storage [DRY RUN]`)
    // log.info(`User ${username} still inactive with significant storage, erasing storage`)
    // await eraseUserStorage(username)
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
            await mark(username)
            await scheduleNotify({username})
            await addEvent({username, event: 'INACTIVE_HIGH'})
            break
        case STORAGE.INACTIVE_LOW:
            log.info(`Detected inactive user ${username} with negligible storage, no action`)
            await addEvent({username, event: 'INACTIVE_LOW'})
            break
        case STORAGE.INACTIVE_UNKNOWN:
            log.info(`Detected inactive user ${username} with unknown storage, will retry`)
            await addEvent({username, event: 'INACTIVE_UNKNOWN'})
            throw new Error(`Unknown storage size for user ${username}`)
        case STORAGE.ACTIVE:
            log.info(`User ${username} now active, not marking inactive`)
            break
    }
}

const notifyInactiveUser = async ({username}) => {
    switch (await getStorageStatus(username)) {
        case STORAGE.INACTIVE_HIGH:
            await notify(username)
            await scheduleErase({username})
            await addEvent({username, event: 'NOTIFIED'})
            break
        case STORAGE.INACTIVE_LOW:
            log.info(`User ${username} still inactive but with negligible storage, not sending notification email`)
            await addEvent({username, event: 'INACTIVE_LOW'})
            break
        case STORAGE.INACTIVE_UNKNOWN:
            log.info(`User ${username} still inactive but with unknown storage, will retry`)
            await addEvent({username, event: 'INACTIVE_UNKNOWN'})
            throw new Error(`Unknown storage size for user ${username}`)
        case STORAGE.ACTIVE:
            log.info(`User ${username} now active, not sending notification email`)
            break
    }
}

const eraseInactiveUserStorage = async ({username}) => {
    switch (await getStorageStatus(username)) {
        case STORAGE.INACTIVE_HIGH:
            await erase(username)
            await addEvent({username, event: 'PURGED'})
            break
        case STORAGE.INACTIVE_LOW:
            log.info(`User ${username} still inactive but with negligible storage, not erasing storage`)
            await addEvent({username, event: 'INACTIVE_LOW'})
            break
        case STORAGE.INACTIVE_UNKNOWN:
            log.info(`User ${username} still inactive but with unknown storage, will retry`)
            await addEvent({username, event: 'INACTIVE_UNKNOWN'})
            throw new Error(`Unknown storage size for user ${username}`)
        case STORAGE.ACTIVE:
            log.info(`User ${username} now active, not erasing storage`)
            break
    }
}

const logStats = async () =>
    log.isTrace() && log.trace('Stats:', [
        `active: ${await queue.getActiveCount()}`,
        `waiting: ${await queue.getWaitingCount()}`,
        `delayed: ${await queue.getDelayedCount()}`,
        `failed: ${await queue.getFailedCount()}`,
    ].join(', '))

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

const scheduleMark = async ({username, delay = inactivityTimeout}) => {
    log.debug(`Scheduling inactive state for user ${username} ${delay ? `in ${formatDistance(0, delay, {includeSeconds: true})}` : 'now'}`)
    return schedule({username, delay, action: 'mark'})
}

const scheduleNotify = async ({username, delay = inactivityNotificationDelay}) => {
    log.debug(`Scheduling inactivity notification for user ${username} ${delay ? `in ${formatDistance(0, delay, {includeSeconds: true})}` : 'now'}`)
    return schedule({username, delay, action: 'notify'})
}

const scheduleErase = async ({username, delay = inactivityGracePeriodTimeout}) => {
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
    mostRecentTimestamp.getTime() + inactivityTimeout - Date.now()

const getDelay = (mostRecentTimestamp = new Date()) =>
    Math.max(0, relativeExpirationTime(mostRecentTimestamp)) + Math.floor(Math.random() * inactivityMaxSpread)

const scheduleInactivityCheck = async ({username}) => {
    await queue.removeJobs(jobId(username, '*'))
    await scheduleMark({username, delay: getDelay()})
}

const cancelInactivityCheck = async ({username}) => {
    log.debug(`Clearing inactivity jobs for user ${username}`)
    await queue.removeJobs(jobId(username, '*'))
    await addEvent({username, event: 'ACTIVE'})
}

const scheduleFullCheck = async () => {
    log.debug('Scheduling check for all users')
    const userActivity = await firstValueFrom(getMostRecentAccessByUser$())
    await queue.obliterate()

    // const {activeUsers, inactiveUsers} = Object.entries(userActivity)
    //     .reduce((acc, [username, mostRecentTimestamp]) => {
    //         acc.now - mostRecentTimestamp.getTime() < INACTIVITY_TIMEOUT_MS
    //             ? acc.activeUsers.push({username, mostRecentTimestamp})
    //             : acc.inactiveUsers.push({username, mostRecentTimestamp})
    //         return acc
    //     }, {activeUsers: [], inactiveUsers: [], now: Date.now()})

    await Promise.all(
        Object.entries(userActivity).map(async ([username, mostRecentTimestamp]) => {
            if (!await queue.getJob(jobId(username, 'mark')) && !await queue.getJob(jobId(username, 'notify')) && !await queue.getJob(jobId(username, 'erase'))) {
                const delay = getDelay(mostRecentTimestamp)
                await scheduleMark({username, delay})
                if (delay > 0) {
                    await addEvent({username, event: 'ACTIVE'})
                } else {
                    await addEvent({username, event: 'INACTIVE_UNKNOWN'})
                }
            }
        })
    )
    log.info('Scheduled check for all users')
}

const startInactivityCheck = async () => {
    log.info('Starting inactivity check processor')

    if (!await getInitialized()) {
        await scheduleFullCheck()
        await setInitialized()
    }
    
    await logStats()
    
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
}

module.exports = {scheduleInactivityCheck, cancelInactivityCheck, startInactivityCheck}
