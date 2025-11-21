const {getMostRecentAccessByUser$} = require('./http')
const {firstValueFrom} = require('rxjs')
const {scheduleInactivityCheck} = require('./inactivityQueue')

const log = require('#sepal/log').getLogger('inactivity')

const scheduleFullInactivityCheck = async () => {
    log.debug('Scheduling inactivity check for all users...')
    const userActivity = await firstValueFrom(getMostRecentAccessByUser$())
    Object.entries(userActivity).forEach(([username, mostRecentTimestamp]) => {
        scheduleInactivityCheck({username, mostRecentTimestamp})
    })
    log.info('Scheduled inactivity check for all users')
}

module.exports = {scheduleFullInactivityCheck}
