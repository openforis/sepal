const {scanUserHomes} = require('./filesystem')
const {scanMinDelayMilliseconds, scanMaxDelayMilliseconds} = require('./config')
const {getUserStorage} = require('./kvstore')
const {scan} = require('./scanQueue')
const log = require('#sepal/log').getLogger('scan')

const scheduleMap = {
    'filesDeleted': {priority: 1, delay: 0},
    'sessionDeactivated': {priority: 2, delay: 0},
    'sessionActivated': {priority: 3, delay: 0},
    'initial': {priority: 6, delay: scanMinDelayMilliseconds},
    'periodic': {priority: 6, delay: scanMaxDelayMilliseconds}
}

const scheduleRescan = async ({username, type}) => {
    const {priority, delay} = scheduleMap[type]
    return await scan({username, priority, delay})
}

const scheduleFullScan = async () => {
    log.info('Starting full scan')
    await scanUserHomes(
        async username => {
            const size = await getUserStorage(username)
            if (size) {
                await scheduleRescan({username, type: 'periodic'})
            } else {
                await scheduleRescan({username, type: 'initial'})
            }
        }
    )
}

module.exports = {scheduleFullScan, scheduleRescan}
