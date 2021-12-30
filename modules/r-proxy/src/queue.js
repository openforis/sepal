const {redisUri} = require('./config')
const Bull = require('bull')
const log = require('sepal/log').getLogger('queue')
const {makeBinaryPackage} = require('./R')

const queue = new Bull('build-queue', redisUri)

const logStats = async () =>
    log.isDebug() && log.debug([
        'Stats:',
        `active: ${await queue.getActiveCount()}`,
        `waiting: ${await queue.getWaitingCount()}`,
        `delayed: ${await queue.getDelayedCount()}`,
        `failed: ${await queue.getFailedCount()}`,
    ].join(', '))

queue.process(async ({data: {requestPath, name, version, repo}}) => {
    log.debug(`Processing ${name}/${version}`)
    const success = await makeBinaryPackage(requestPath, name, version, repo)
    log.debug(`Processed ${name}/${version}`)
    return {success}
})

queue.on('error', error => log.error(error))

queue.on('failed', (job, error) => {
    const {name, version} = job.data
    log.error(`Rescanning ${name}/${version} failed:`, error)
})

queue.on('stalled', job => {
    const {name, version} = job.data
    log.warn(`Job stalled while rescanning ${name}/${version}`, job)
})

queue.on('drained', async () => await logStats())

queue.on('completed', async (job, {success}) => {
    const {name, version} = job.data
    if (success) {
        log.debug(`Completed ${name}/${version}`)
    } else {
        log.warn(`Failed ${name}/${version}`)
    }
})

const enqueueMakeBinaryPackage = (requestPath, name, version, repo) => {
    log.debug(`Enqueuing ${name}/${version}`)
    return queue.add({requestPath, name, version, repo})
}

module.exports = {enqueueMakeBinaryPackage, logStats}
