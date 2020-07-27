const Redis = require('ioredis')
const {redisUri} = require('./config')
const log = require('sepal/log').getLogger('jobQueue')

const redis = new Redis(redisUri)

const key = key => `session:${key}`

const setActive = username => {
    log.debug(`Worker session for user ${username} active`)
    redis.set(key(username), 'true')
}

const setInactive = username => {
    log.debug(`Worker session for user ${username} inactive`)
    redis.set(key(username), 'false')
}

const getSessionStatus = async username => await redis.get(key(username)) === 'true'

module.exports = {setActive, setInactive, getSessionStatus}
