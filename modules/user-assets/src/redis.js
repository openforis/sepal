const Redis = require('ioredis')
const {redisUri} = require('./config')

const log = require('#sepal/log').getLogger('redis')

const redis = new Redis(redisUri)

const serialize = value => {
    try {
        return value === null || value === undefined
            ? null
            : JSON.stringify(value)
    } catch (_error) {
        log.warn('Cannot serialize value:', value)
        return null
    }
}

const deserialize = value => {
    try {
        return value === null || value === undefined
            ? null
            : JSON.parse(value)
    } catch (_error) {
        log.warn('Cannot deserialize value:', value)
        return null
    }
}

module.exports = {redis, serialize, deserialize}
