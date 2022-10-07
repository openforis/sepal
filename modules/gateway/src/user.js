const log = require('sepal/log').getLogger('user')
const _ = require('lodash')

const SEPAL_USER_HEADER = 'sepal-user'

const serialize = value => {
    try {
        return _.isNil(value)
            ? null
            : JSON.stringify(value)
    } catch (error) {
        log.warn('Cannot serialize value:', value)
    }
}

const deserialize = value => {
    try {
        return _.isNil(value)
            ? null
            : JSON.parse(value)
    } catch (error) {
        log.warn('Cannot deserialize value:', value)
    }
}

const UserStore = redis => {
    if (!redis) {
        throw new Error('Cannot initialize UserStore due to missing argument: redis')
    }

    const userKey = username =>
        `user:${username}`

    const getUser = async username =>
        await redis.get(userKey(username))
            .then(deserialize)

    const setUser = async user =>
        await redis.set(userKey(user.username), serialize(user))
            .then(result => result === 'OK')

    const userMiddleware = (req, res, next) => {
        const username = getSessionUsername(req)
        if (username) {
            getUser(username).then(user => {
                if (user) {
                    setRequestUser(req, user)
                    log.isTrace()
                        ? log.trace(`[${username}] populated context with user:`, user)
                        : log.debug(`[${username}] populated context with user`)
                } else {
                    log.warn('Cannot populate context with user:', username)
                }
                next()
            })
        } else {
            next()
        }
    }

    return {
        getUser, setUser, userMiddleware
    }
}

const getSessionUsername = req =>
    req.session.username

const setSessionUsername = (req, username) =>
    req.session.username = username

const getRequestUser = req =>
    deserialize(req.headers[SEPAL_USER_HEADER])

const setRequestUser = (req, user) =>
    req.headers[SEPAL_USER_HEADER] = serialize(user)

module.exports = {
    SEPAL_USER_HEADER,
    UserStore,
    getSessionUsername,
    setSessionUsername,
    getRequestUser,
    setRequestUser
}
