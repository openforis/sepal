const {send, tag} = require('./email')
const {redisUri, concurrency} = require('./config')
const {filterEmailNotificationsEnabled} = require('./user')
const Bull = require('bull')
const log = require('#sepal/log').getLogger('emailQueue')
const {default: ShortUniqueId} = require('short-unique-id')
const uid = new ShortUniqueId()

const queue = new Bull('email-queue', redisUri)

queue.process(concurrency, async job => {
    const id = job.id
    const email = job.data
    const {to: originalTo, cc: originalCc, bcc: originalBcc, ...props} = email

    const to = await filterEmailNotificationsEnabled(originalTo)
    const cc = await filterEmailNotificationsEnabled(originalCc)
    const bcc = await filterEmailNotificationsEnabled(originalBcc)

    if (to.length || cc.length || bcc.length) {
        return await send({id, email: {to, cc, bcc, ...props}})
    } else {
        log.debug(() => 'Email discarded due as no recipient is enabled to receive email notifications')
    }
})

queue.on('error', error => {
    log.error(error)
})

queue.on('failed', (job, error) => {
    const email = job.data
    if (job.finishedOn) {
        log.error(`Could not send email to ${email.to}:`, error)
    } else {
        log.debug(`Cannot send email to ${email.to}, will retry:`, error)
    }
})

queue.on('stalled', job => {
    const email = job.data
    log.warn(`Could not send email to ${email.to}`, job)
})

queue.on('drained', async () => await logStats())

const enqueue = async (message, {id = uid(), priority = 1} = {}) => {
    log.debug(() => `<${id}> Enqueuing email ${tag(message)} with priority ${priority}`)
    return await queue.add(message, {
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

module.exports = {enqueue, logStats}
