import Redis from 'ioredis'
import {redisUri} from './config.js'

import {getLogger} from '#sepal/log'
const log = getLogger('redis')

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

export {redis, serialize, deserialize}
