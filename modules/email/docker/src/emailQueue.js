const {send} = require('./email')
const {redisUri, concurrency} = require('./config')
const Bull = require('bull')
const log = require('sepal/log').getLogger('emailQueue')

const queue = new Bull('email-queue', redisUri)

queue.process(concurrency, async job => {
    const email = job.data
    return await send(email)
})

queue.on('error', error => {
    log.error(error)
})

queue.on('failed', (job, error) => {
    const email = job.data
    log.error(`Could not send email to ${email.to}:`, error)
})

queue.on('stalled', job => {
    const email = job.data
    log.warn(`Could not send email to ${email.to}`, job)
})

queue.on('drained', async () => await logStats())

const enqueue = async ({to, priority = 1}) => {
    log.debug(`Enqueuing email ${username} with priority ${priority}`)
    return await queue.add({username}, {
        priority,
        attempts: 10,
        backoff: {
            type: 'exponential',
            delay: 60000
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
