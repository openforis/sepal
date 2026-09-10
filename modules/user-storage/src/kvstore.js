import {Redis} from 'ioredis'

import {getLogger} from '#sepal/log'
import {applyKeyNormalization} from '#sepal/redisKeyCase'
import {storedUsername} from '#sepal/username'

import {redisHost} from './config.js'

const log = getLogger('kvstore')

const DB = {
    MAIN: 0,
    SCAN_QUEUE: 1,
    INACTIVITY_QUEUE: 2
}

const redis = new Redis({
    host: redisHost,
    db: DB.MAIN
})

const SESSION_PREFIX = 'session'
const LAST_ACTIVE_PREFIX = 'lastActive'
const LAST_INACTIVE_PREFIX = 'lastInactive'
const STORAGE_PREFIX = 'storage'

const sessionKey = username => `${SESSION_PREFIX}:${storedUsername(username)}`
const lastActiveKey = username => `${LAST_ACTIVE_PREFIX}:${storedUsername(username)}`
const lastInactiveKey = username => `${LAST_INACTIVE_PREFIX}:${storedUsername(username)}`
const storageKey = username => `${STORAGE_PREFIX}:${storedUsername(username)}`

const getInitialized = async () => {
    log.debug('Getting initialization timestamp...')
    const timestamp = await redis.get('initialized')
    log.info(timestamp ? `Got initialization timestamp: ${timestamp}` : 'Initialization timestamp not set')
    return timestamp
}

const setInitialized = async (timestamp = new Date()) => {
    log.debug('Setting initialization timestamp...')
    await redis.set('initialized', timestamp)
    log.info('Set initialization timestamp:', timestamp)
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

const scanKeys = async prefix => {
    const keys = []
    for await (const batch of redis.scanStream({match: `${prefix}:*`, count: 1000})) {
        keys.push(...batch)
    }
    return keys
}

// These keys were written from the username an event happened to carry, so one user can own a set
// per spelling: a storage size that contradicts the live one, a session flag that never cleared.
// Only the stored spelling is read now, and the values here are plain sizes, timestamps and flags
// with no username inside, so a key with no stored counterpart is renamed rather than dropped —
// renaming keeps what it recorded, and there is nothing in the value to correct.
const normalizeCase = async () => {
    for (const prefix of [SESSION_PREFIX, LAST_ACTIVE_PREFIX, LAST_INACTIVE_PREFIX, STORAGE_PREFIX]) {
        const {removed, renamed} = await applyKeyNormalization(await scanKeys(prefix), {
            prefix,
            renameKey: async (from, to) => await redis.renamenx(from, to) === 1,
            removeKeys: keys => redis.del(keys)
        })
        log.info(`Normalized ${prefix} keys: ${removed} duplicate(s) removed, ${renamed} renamed`)
    }
}

export {DB, getInitialized, getSessionStatus, getSetUserStorage, getUserStorage, normalizeCase, setInitialized, setSessionActive, setSessionInactive}
