const Redis = require('ioredis')
const {redisUri} = require('./config')

const log = require('#sepal/log').getLogger('redis')

const redis = new Redis(redisUri)

const serialize = value => {
    try {
        return value !== undefined
            ? JSON.stringify(value)
            : null
    } catch (error) {
        log.warn('Cannot serialize value:', value)
    }
}

const deserialize = value => {
    try {
        return value !== undefined
            ? JSON.parse(value)
            : null
    } catch (error) {
        log.warn('Cannot deserialize value:', value)
    }
}

module.exports = {redis, serialize, deserialize}
