const log = require('#sepal/log').getLogger('user')
const _ = require('lodash')
const {usernameTag} = require('./tag')

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

const getRequestUser = req =>
    deserialize(req.headers[SEPAL_USER_HEADER])

const setRequestUser = (req, user) => {
    const userInfo = _.pick(user, ['id', 'username', 'googleTokens', 'status', 'roles', 'systemUser', 'admin'])
    log.isTrace()
        ? log.trace(`${usernameTag(user.username)} Injecting user into request headers:`, userInfo)
        : log.isDebug() && log.debug(`${usernameTag(user.username)} Injecting user into request headers`)
    req.headers[SEPAL_USER_HEADER] = serialize(userInfo)
}

module.exports = {SEPAL_USER_HEADER, getRequestUser, setRequestUser}
