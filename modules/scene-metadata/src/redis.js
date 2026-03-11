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

    const getLastUpdate = async dataset => {
        log.debug(`Getting last update for dataset ${dataset}...`)
        const lastUpdate = await redis.get(`lastUpdate:${dataset}`)
        log.info(`Got last update for dataset ${dataset}:`, lastUpdate)
        return lastUpdate
    }

    const setLastUpdate = async lastUpdateByDataset => {
        log.debug('Setting last update:', lastUpdateByDataset)
        if (lastUpdateByDataset) {
            await redis.mSet(
                Object.fromEntries(
                    Object.entries(lastUpdateByDataset).map(
                        ([key, value]) => [`lastUpdate:${key}`, value]
                    )
                )
            )
        } else {
            const keys = await redis.keys('lastUpdate:*')
            if (keys.length > 0) {
                await redis.del(keys)
            }
        }
        log.info('Set last update:', lastUpdateByDataset)
    }

    return {getInitialized, setInitialized, getLastUpdate, setLastUpdate}
}

module.exports = {initializeRedis}
