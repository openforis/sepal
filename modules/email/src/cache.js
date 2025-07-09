const Redis = require('ioredis')
const {redisUri} = require('./config')
const log = require('#sepal/log').getLogger('cache')

const redis = new Redis(redisUri)

const emailNotificationsEnabledKey = key => `emailNotificationsEnabled:${key}`

const fromBoolean = value => {
    switch (value) {
        case undefined:
            return null
        case true:
            return 'true'
        case false:
            return 'false'
        default:
            log.warn('fromBoolean expected three-state boolean, got unexpected value:', value)
            return undefined
    }
}

const toBoolean = value => {
    switch (value) {
        case null:
            return undefined
        case 'true':
            return true
        case 'false':
            return false
        default:
            log.warn('toBoolean expected three-state boolean, got unexpected value:', value)
            return undefined
    }
}

const setEmailNotificationsEnabled = async (emailAddress, enabled) => {
    log.debug(() => `Setting email notifications preference for address <${emailAddress}>: ${enabled}`)
    await redis.set(emailNotificationsEnabledKey(emailAddress), fromBoolean(enabled))
}

const getEmailNotificationsEnabled = async emailAddress => {
    log.debug(() => `Getting email notifications preference for address <${emailAddress}>`)
    return toBoolean(await redis.get(emailNotificationsEnabledKey(emailAddress)))
}

module.exports = {setEmailNotificationsEnabled, getEmailNotificationsEnabled}
