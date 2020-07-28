const {calculateUserStorage} = require('./userStorage')
const {redisUri, minDelayMilliseconds, maxDelayMilliseconds, concurrency} = require('./config')
const {getSessionStatus, getSetUserStorage} = require('./persistence')
const Bull = require('bull')
const {v4: uuid} = require('uuid')
const log = require('sepal/log').getLogger('jobQueue')

const SPREAD = .3

const queue = new Bull('scan-queue', redisUri)

const rescanCompleteListeners = []

const rescanJobId = (username, jobId = uuid()) =>
    `rescan-${username}-${jobId}`

const spreadDelay = delay =>
    Math.floor(delay * (1 + (Math.random() - .5) * 2 * SPREAD))

const scheduleRescan = async ({username, delay: nominalDelay = maxDelayMilliseconds, priority = 1}) => {
    const delay = spreadDelay(nominalDelay)
    delay
        ? log.debug(`Submitting delayed rescan for user ${username} with priority ${priority} in ${Math.round(delay / 1000)}s`)
        : log.debug(`Submitting immediate rescan for user ${username} with priority ${priority}`)
    await queue.removeJobs(rescanJobId(username, '*'))
    return await queue.add({username}, {
        jobId: rescanJobId(username),
        priority,
        delay,
        removeOnComplete: true
    })
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
    const {username} = job.data
    const workerSession = await getSessionStatus(username)
    const previousSize = await getSetUserStorage(username, size)
    const reschedule = ({priority, delay}) =>
        scheduleRescan({
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
    rescanCompleteListeners.forEach(callback => callback({username, size}))
})

const scheduleMap = {
    'fileDeleted': {priority: 1, delay: 0},
    'sessionDeactivated': {priority: 2, delay: 0},
    'sessionActivated': {priority: 3, delay: 0},
    'initial': {priority: 6, delay: minDelayMilliseconds},
    'periodic': {priority: 6, delay: maxDelayMilliseconds}
}

module.exports = {
    scheduleRescan: async ({username, type}) => {
        const {priority, delay} = scheduleMap[type]
        return await scheduleRescan({username, priority, delay})
    },
    onRescanComplete: callback => {
        rescanCompleteListeners.push(callback)
    }
}
