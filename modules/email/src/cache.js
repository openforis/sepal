import Redis from 'ioredis'

import {getLogger} from '#sepal/log'

import {redisHost} from './config.js'

const log = getLogger('cache')

const redis = new Redis({
    host: redisHost,
    db: 0
})

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

// A preference fetched from the user module must not overwrite one set by a concurrent user update.
const setEmailNotificationsEnabledIfAbsent = async (emailAddress, enabled) => {
    log.debug(() => `Caching email notifications preference for address <${emailAddress}>: ${enabled}`)
    await redis.set(emailNotificationsEnabledKey(emailAddress), fromBoolean(enabled), 'NX')
}

const getEmailNotificationsEnabled = async emailAddress => {
    log.debug(() => `Getting email notifications preference for address <${emailAddress}>`)
    return toBoolean(await redis.get(emailNotificationsEnabledKey(emailAddress)))
}

const clearEmailNotificationsEnabled = async () => {
    let cursor = '0'
    do {
        const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', emailNotificationsEnabledKey('*'), 'COUNT', 1000)
        if (keys.length) {
            await redis.del(...keys)
        }
        cursor = nextCursor
    } while (cursor !== '0')
    log.debug('Cleared email notifications preferences')
}

export {clearEmailNotificationsEnabled, getEmailNotificationsEnabled, setEmailNotificationsEnabled, setEmailNotificationsEnabledIfAbsent}
