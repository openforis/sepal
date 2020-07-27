const {calculateUserStorage} = require('./userStorage')
const {redisUri, minDelayMilliseconds, maxDelayMilliseconds, concurrency} = require('./config')
const {getSessionStatus} = require('./workerSession')
const Bull = require('bull')
const {v4: uuid} = require('uuid')
const log = require('sepal/log').getLogger('jobQueue')

const SPREAD = .2

const queue = new Bull('scan-queue', redisUri)

const rescanJobId = (username, jobId = uuid()) =>
    `rescan-${username}-${jobId}`

const spreadDelay = delay =>
    Math.floor(delay * (1 - SPREAD + Math.random() * 2 * SPREAD))

const scheduleRescan = async ({username, size, delay: nominalDelay = 0, priority = 1}) => {
    const delay = spreadDelay(nominalDelay)
    delay
        ? log.debug(`Submitting delayed rescan for user ${username} in ${delay}ms`)
        : log.debug(`Submitting immediate rescan for user ${username}`)
    await queue.removeJobs(rescanJobId(username, '*'))
    return await queue.add({username, size}, {
        jobId: rescanJobId(username),
        priority,
        delay,
        removeOnComplete: true
    })
}

const cancelRescans = async username => {
    log.debug(`Cancelling pending rescans for user ${username}`)
    await queue.removeJobs(rescanJobId(username, '*'))
}

queue.process(concurrency, async job => {
    const {username} = job.data
    return {
        size: await calculateUserStorage(username)
    }
})

const increasingDelay = delay =>
    Math.min(delay * 2, maxDelayMilliseconds)

queue.on('completed', async (job, {size}) => {
    const {username, size: previousSize} = job.data
    const session = await getSessionStatus(username)
    const reschedule = ({priority, delay}) =>
        scheduleRescan({
            username,
            session,
            size,
            priority,
            delay
        })
    if (session) {
        reschedule({
            priority: 3,
            delay: minDelayMilliseconds
        })
    } else if (!previousSize) {
        reschedule({
            priority: 6,
            delay: maxDelayMilliseconds
        })
    } else if (size !== previousSize) {
        reschedule({
            priority: 4,
            delay: minDelayMilliseconds
        })
    } else {
        reschedule({
            priority: 5,
            delay: increasingDelay(job.opts.delay)
        })
    }
})

module.exports = {
    scheduleRescan, cancelRescans
}
