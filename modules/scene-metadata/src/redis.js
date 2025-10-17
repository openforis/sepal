const {createClient} = require('redis')
const {redisUri} = require('./config')
const log = require('#sepal/log').getLogger('redis')

const initializeRedis = async () => {
    const redis = await createClient({url: redisUri})
        .on('connect', () => log.info('Connected to Redis:', redisUri))
        .on('error', err => log.error('Redis connection error', err))
        .connect()

    const getInitialized = async () => {
        log.debug('Getting initialize...')
        const timestamp = await redis.get('initialized')
        log.info('Got initialized:', timestamp)
        return timestamp
    }

    const setInitialized = async timestamp => {
        log.debug('Setting initialized...')
        await redis.set('initialized', timestamp)
        log.info('Setting initialized:', timestamp)
    }

    const getLastUpdate = async collection => {
        log.debug(`Getting last update for collection ${collection}...`)
        const lastUpdate = await redis.get(collection)
        log.info(`Got last update for collection ${collection}:`, lastUpdate)
        return lastUpdate
    }

    const setLastUpdate = async (collection, lastUpdate) => {
        log.debug(`Setting last update for collection ${collection}...`)
        if (lastUpdate) {
            await redis.set(collection, lastUpdate)
        } else {
            await redis.del(collection)
        }
        log.info(`Set last update for collection ${collection}:`, lastUpdate)
    }

    return {getInitialized, setInitialized, getLastUpdate, setLastUpdate}
}

module.exports = {initializeRedis}
