const Redis = require('ioredis')
const {redisUri} = require('./config')
const log = require('#sepal/log').getLogger('persistence')

const redis = new Redis(redisUri)

const sessionKey = key => `session:${key}`
const storageKey = key => `storage:${key}`

const setSessionActive = async username => {
    log.debug(`Setting session status for user ${username} active`)
    await redis.set(sessionKey(username), 'true')
}

const setSessionInactive = async username => {
    log.debug(`Setting session status for user ${username} inactive`)
    await redis.set(sessionKey(username), 'false')
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

module.exports = {setSessionActive, setSessionInactive, getSessionStatus, getSetUserStorage, getUserStorage}
