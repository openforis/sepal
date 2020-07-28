const {calculateUserStorage} = require('./filesystem')
const {redisUri, minDelayMilliseconds, maxDelayMilliseconds, delayIncreaseFactor, concurrency} = require('./config')
const {getSessionStatus, getSetUserStorage} = require('./persistence')
const Bull = require('bull')
const {v4: uuid} = require('uuid')
const {formatDistanceToNow} = require('date-fns')
const log = require('sepal/log').getLogger('jobQueue')

const SPREAD = .2

const queue = new Bull('scan-queue', redisUri)

const scanCompleteListeners = []

const rescanJobId = (username, jobId = uuid()) =>
    `rescan-${username}-${jobId}`

const spreadDelay = delay =>
    Math.floor(delay * (1 + (Math.random() - .5) * 2 * SPREAD))

const increasingDelay = delay =>
    Math.min(delay * delayIncreaseFactor, maxDelayMilliseconds)

const timeDistance = delay =>
    formatDistanceToNow(Date.now() + delay)

queue.process(concurrency, async job => {
    const {username} = job.data
    return {
        size: await calculateUserStorage(username)
    }
})

queue.on('completed', async (job, {size}) => {
    const {username} = job.data
    const workerSession = await getSessionStatus(username)
    const previousSize = await getSetUserStorage(username, size)
    const reschedule = ({priority, delay}) =>
        scan({
            username,
            priority,
            delay
        })
    if (workerSession) {
        reschedule({
            priority: 3,
            delay: minDelayMilliseconds
        })
    } else if (job.opts.delay < maxDelayMilliseconds && job.opts.priority !== 6) {
        if (size !== previousSize) {
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
    } else {
        reschedule({
            priority: 6,
            delay: maxDelayMilliseconds
        })
    }

    scanCompleteListeners.forEach(
        callback => callback({username, size})
    )
})

const scan = async ({username, delay: nominalDelay = maxDelayMilliseconds, priority = 1}) => {
    const delay = spreadDelay(nominalDelay)
    log.debug(`Rescanning user ${username} with priority ${priority} ${delay ? `in ${timeDistance(delay)}` : 'now'}`)
    await queue.removeJobs(rescanJobId(username, '*'))
    return await queue.add({username}, {
        jobId: rescanJobId(username),
        priority,
        delay,
        removeOnComplete: 10
    })
}

const onScanComplete = callback => {
    scanCompleteListeners.push(callback)
}

module.exports = {scan, onScanComplete}
