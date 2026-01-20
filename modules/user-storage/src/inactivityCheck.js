const {Queue, QueueEvents, Worker, Job} = require('bullmq')
const {firstValueFrom} = require('rxjs')
const {formatDistance} = require('date-fns')
const {eraseUserStorage} = require('./filesystem')
const {redisHost, inactivityTimeout, inactivityNotificationDelay, inactivityGracePeriod, inactivityMaxSpread, inactivityUserStorageThreshold, inactivityMaxRetries, inactivityInitialRetryDelay, inactivityConcurrency} = require('./config')
const {sendEmail} = require('./email')
const {addEvent} = require('./database')
const {getMostRecentAccessByUser$, getMostRecentAccess$, getUser$} = require('./http')
const {getUserStorage, DB, getInitialized, setInitialized} = require('./kvstore')
const {Redis} = require('ioredis')
const log = require('#sepal/log').getLogger('inactivityCheck')

const QUEUE = 'inactivity-check'

const getEmailSubject = () => {
    const environment = process.env.DEPLOY_ENVIRONMENT
    return `Action required to retain your SEPAL data ${environment !== 'PROD' ? `in ${environment} environment` : ''}`
}

const getEmailMessage = name => {
    const environment = process.env.DEPLOY_ENVIRONMENT
    return `
        Dear ${name},
        <br><br>
        We are writing to inform you that your SEPAL account at <b>${process.env.SEPAL_HOST}</b> ${environment !== 'PROD' ? `(<b>${environment}&nbsp;environment</b>)` : ''} has not shown any recent activity for an extended period.
        <br><br>
        As SEPAL incurs ongoing cloud storage costs for user data, we periodically review inactive accounts. If you wish to retain your existing data, you are required to confirm your continued use of the service by logging in to your SEPAL account.
        <br><br>
        If no login activity is detected within one (1) month from the date of this message, your account data will be permanently deleted. This deletion will occur automatically and without further notification, and the data will not be recoverable.
        <br><br>
        To retain your data, simply log in to your account at any time during the grace period.
        <br><br>
        If you no longer require your SEPAL account data, no action is needed.
        <br><br>
        If you have questions or require assistance, please contact our support team.
        <br><br>
        Sincerely,
        <br>
        The SEPAL Team
    `
}

const connection = new Redis({
    host: redisHost,
    db: DB.INACTIVITY_QUEUE,
    maxRetriesPerRequest: null
})

const queue = new Queue(QUEUE, {
    connection
})

const queueEvents = new QueueEvents(QUEUE, {
    connection
})

const jobId = (username, action) =>
    `job-${username}-${action}`

const STORAGE = {
    INACTIVE_HIGH: Symbol('INACTIVE_HIGH'),
    INACTIVE_LOW: Symbol('INACTIVE_LOW'),
    INACTIVE_UNKNOWN: Symbol('INACTIVE_UNKNOWN'),
    ACTIVE: Symbol('ACTIVE')
}

const notify = async username => {
    if (username.startsWith('lookap')) { // REMOVE
        log.info(`User ${username} still inactive with significant storage, sending notification email - TEST MODE`)
        const {name} = await firstValueFrom(getUser$(username))
        await sendEmail({
            username,
            subject: getEmailSubject(),
            content: getEmailMessage(name)
        })
    }
}

const erase = async username => {
    if (username.startsWith('lookap')) { // REMOVE
        log.info(`User ${username} still inactive with significant storage, erasing storage - TEST MODE`)
        await eraseUserStorage(username)
    }
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
            if (parseInt(userStorageSize) > inactivityUserStorageThreshold) {
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
            log.info(`User ${username} inactive with significant storage, noted`)
            await scheduleNotify({username})
            await addEvent({username, event: 'INACTIVE_HIGH'})
            break
        case STORAGE.INACTIVE_LOW:
            log.info(`User ${username} inactive with negligible storage, no action`)
            await addEvent({username, event: 'INACTIVE_LOW'})
            break
        case STORAGE.INACTIVE_UNKNOWN:
            log.info(`User ${username} inactive with unknown storage, will retry`)
            await addEvent({username, event: 'INACTIVE_UNKNOWN'})
            throw new Error(`Unknown storage size for user ${username}`)
        case STORAGE.ACTIVE:
            log.info(`User ${username} now active, no action`)
            await addEvent({username, event: 'ACTIVE'})
            break
    }
}

const notifyInactiveUser = async ({username}) => {
    switch (await getStorageStatus(username)) {
        case STORAGE.INACTIVE_HIGH:
            log.info(`User ${username} still inactive with significant storage, sending notification email`)
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
            await addEvent({username, event: 'ACTIVE'})
            break
    }
}

const eraseInactiveUserStorage = async ({username}) => {
    switch (await getStorageStatus(username)) {
        case STORAGE.INACTIVE_HIGH:
            log.info(`User ${username} inactive with significant storage, erasing storage`)
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
            await addEvent({username, event: 'ACTIVE'})
            break
    }
}

queueEvents.on('error', error => {
    log.error(error)
})

queueEvents.on('completed', async ({jobId}) => {
    if (log.isDebug()) {
        const job = await Job.fromId(queue, jobId)
        const {username, action} = job.data
        log.debug(`Completed job for user ${username}, action: ${action}`)
    }
})

queueEvents.on('failed', async ({jobId, failedReason}) =>
    log.error(`Job ${jobId} failed:`, failedReason)
)

queueEvents.on('stalled', ({jobId}) => {
    log.warn(`Job ${jobId} stalled`)
})

const removeUserJobs = async username => {
    await queue.remove(jobId(username, 'mark'))
    await queue.remove(jobId(username, 'notify'))
    await queue.remove(jobId(username, 'erase'))
}

const scheduleMark = async ({username, delay = inactivityTimeout}) => {
    log.info(`Scheduling inactive state for user ${username} ${delay ? `in ${formatDistance(0, delay, {includeSeconds: true})}` : 'now'}`)
    return schedule({username, delay, action: 'mark'})
}

const scheduleNotify = async ({username, delay = inactivityNotificationDelay}) => {
    log.info(`Scheduling inactivity notification for user ${username} ${delay ? `in ${formatDistance(0, delay, {includeSeconds: true})}` : 'now'}`)
    return schedule({username, delay, action: 'notify'})
}

const scheduleErase = async ({username, delay = inactivityGracePeriod}) => {
    log.info(`Scheduling inactivity storage erase for user ${username} ${delay ? `in ${formatDistance(0, delay, {includeSeconds: true})}` : 'now'}`)
    await removeUserJobs(username)
    return schedule({username, delay, action: 'erase'})
}

const schedule = async ({username, delay, action}) =>
    await queue.add('rescan', {username, action}, {
        jobId: jobId(username, action),
        priority: 1,
        delay,
        attempts: inactivityMaxRetries,
        backoff: {
            type: 'exponential',
            delay: inactivityInitialRetryDelay
        },
        removeOnComplete: 10,
        removeOnFail: 100
    })

// positive: future, negative: past
const relativeExpirationTime = mostRecentTimestamp =>
    mostRecentTimestamp.getTime() + inactivityTimeout - Date.now()

const getDelay = (mostRecentTimestamp = new Date()) =>
    Math.max(0, relativeExpirationTime(mostRecentTimestamp))

const scheduleInactivityCheck = async ({username}) => {
    await removeUserJobs(username)
    await scheduleMark({username, delay: getDelay()})
}

const cancelInactivityCheck = async ({username}) => {
    log.info(`Clearing inactivity jobs for user ${username}`)
    await removeUserJobs(username)
    await addEvent({username, event: 'ACTIVE'})
}

const scheduleFullCheck = async () => {
    log.debug('Scheduling check for all users')
    const userActivity = await firstValueFrom(getMostRecentAccessByUser$())
    await queue.obliterate()

    await Promise.all(
        Object.entries(userActivity).map(async ([username, mostRecentTimestamp]) => {
            if (!await queue.getJob(jobId(username, 'mark')) && !await queue.getJob(jobId(username, 'notify')) && !await queue.getJob(jobId(username, 'erase'))) {
                const delay = getDelay(mostRecentTimestamp)
                await scheduleMark({username, delay: delay + Math.floor(Math.random() * inactivityMaxSpread)})
                // await scheduleMark({username, delay})
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

const processJob = async job => {
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
}

const startInactivityCheck = async () => {
    log.info('Starting inactivity check processor')

    if (!await getInitialized()) {
        await scheduleFullCheck()
        await setInitialized()
    }
    
    new Worker(QUEUE, processJob, {
        connection,
        concurrency: inactivityConcurrency
    })
}

module.exports = {scheduleInactivityCheck, cancelInactivityCheck, startInactivityCheck}
