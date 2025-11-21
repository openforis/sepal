const Redis = require('ioredis')
const {redisUri} = require('./config')
const log = require('#sepal/log').getLogger('kvstore')

const redis = new Redis(redisUri)

const sessionKey = key => `session:${key}`
const lastActiveKey = key => `lastActive:${key}`
const lastInactiveKey = key => `lastInactive:${key}`
const storageKey = key => `storage:${key}`

const getInitialized = async () => {
    log.debug('Getting initialize...')
    const timestamp = await redis.get('initialized')
    log.info('Got initialized:', timestamp)
    return timestamp
}

const setInitialized = async (timestamp = new Date()) => {
    log.debug('Setting initialized...')
    await redis.set('initialized', timestamp)
    log.info('Setting initialized:', timestamp)
}

const setSessionActive = async username => {
    log.debug(`Setting session status for user ${username} active`)
    await redis.mset({
        [sessionKey(username)]: 'true',
        [lastActiveKey(username)]: new Date().toISOString()
    })
}

const setSessionInactive = async username => {
    log.debug(`Setting session status for user ${username} inactive`)
    await redis.mset({
        [sessionKey(username)]: 'false',
        [lastInactiveKey(username)]: new Date().toISOString()
    })
}

const getSessionStatus = async username => {
    log.debug(`Getting session status for user ${username}`)
    return await redis.get(sessionKey(username)) === 'true'
}

const getSetUserStorage = async (username, size) => {
    log.debug(`Updating user storage for user ${username}`)
    return parseInt(await redis.getset(storageKey(username), size))
}

const getUserStorage = async username => {
    log.debug(`Getting user storage for user ${username}`)
    return await redis.get(storageKey(username))
}

module.exports = {getInitialized, setInitialized, setSessionActive, setSessionInactive, getSessionStatus, getSetUserStorage, getUserStorage}
