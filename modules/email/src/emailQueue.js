const {Redis} = require('ioredis')
const {Queue, QueueEvents, Worker} = require('bullmq')
const {send, tag} = require('./email')
const {redisHost, concurrency} = require('./config')
const {filterEmailNotificationsEnabled} = require('./user')
const log = require('#sepal/log').getLogger('emailQueue')
const {default: ShortUniqueId} = require('short-unique-id')
const uid = new ShortUniqueId()

const QUEUE = 'email-queue'

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

queue.on('error', error =>
    log.error(error)
)

queueEvents.on('failed', async ({jobId, failedReason}) => {
    const job = await queue.getJob(jobId)
    if (job) {
        const email = job.data
        if (job.finishedOn) {
            log.error(`Could not send email to ${email.to}:`, failedReason)
        } else {
            log.debug(`Cannot send email to ${email.to}, will retry:`, failedReason)
        }
    } else {
        log.error(`Job ${jobId} failed:`, failedReason)
    }
})

queueEvents.on('stalled', async ({jobId}) => {
    const job = await queue.getJob(jobId)
    if (job) {
        const email = job.data
        log.warn(`Could not send email to ${email.to}`, job)
    } else {
        log.warn(`Job ${jobId} stalled`)
    }
})

queue.on('drained', async () =>
    await logStats()
)

const enqueue = async (message, {id = uid.rnd(), priority = 1} = {}) => {
    log.debug(() => `<${id}> Enqueuing email ${tag(message)} with priority ${priority}`)
    return await queue.add('email', message, {
        jobId: id,
        priority,
        attempts: 10,
        backoff: {
            type: 'exponential',
            delay: 10000
        },
        removeOnComplete: 10,
        removeOnFail: 10
    })
}

const logStats = async () =>
    log.isTrace() && log.trace('Stats:', [
        `active: ${await queue.getActiveCount()}`,
        `waiting: ${await queue.getWaitingCount()}`,
        `delayed: ${await queue.getDelayedCount()}`,
        `failed: ${await queue.getFailedCount()}`,
    ].join(', '))

const processJob = async job => {
    const id = job.id
    const email = job.data
    const {to: originalTo, cc: originalCc, bcc: originalBcc, forceEmailNotificationEnabled, ...props} = email

    const to = await filterEmailNotificationsEnabled(originalTo, forceEmailNotificationEnabled)
    const cc = await filterEmailNotificationsEnabled(originalCc, forceEmailNotificationEnabled)
    const bcc = await filterEmailNotificationsEnabled(originalBcc, forceEmailNotificationEnabled)

    if (to.length || cc.length || bcc.length) {
        return await send({id, email: {to, cc, bcc, ...props}})
    } else {
        log.debug(() => 'Email discarded due as no recipient is enabled to receive email notifications')
    }
}

const initQueue = async () => {
    await logStats()
    new Worker(QUEUE, processJob, {
        connection,
        concurrency
    })
}

module.exports = {enqueue, initQueue}
