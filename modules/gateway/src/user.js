import _ from 'lodash'

import {getLogger} from '#sepal/log'
import {storedUsername} from '#sepal/username'

import {usernameTag} from './tag.js'

const log = getLogger('user')

const SEPAL_USER_HEADER = 'sepal-user'
// The WORKER session a request was authenticated as, when it authenticated with a session api key -
// not the browser login session. Request-local, derived from the key, and never carrying it.
export const SEPAL_SESSION_HEADER = 'sepal-session'
const SEPAL_USER_UPDATED_HEADER = 'sepal-user-updated'
const SEPAL_BUDGET_UPDATED_HEADER = 'sepal-budget-updated'

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

const getSessionUsername = req =>
    req.session.username

const setSessionUsername = (req, username) =>
    req.session.username = storedUsername(username)

const getRequestUser = req =>
    deserialize(req.headers[SEPAL_USER_HEADER])

const setRequestUser = (req, user) => {
    const userInfo = {
        ..._.pick(user, ['id', 'username', 'googleTokens', 'status', 'roles', 'systemUser', 'admin']),
        username: storedUsername(user.username)
    }
    log.isTrace()
        ? log.trace(`${usernameTag(user.username)} Injecting user into request headers:`, userInfo)
        : log.isDebug() && log.debug(`${usernameTag(user.username)} Injecting user into request headers`)
    req.headers[SEPAL_USER_HEADER] = serialize(userInfo)
}

const removeRequestUser = req =>
    delete req.headers[SEPAL_USER_HEADER]

export const getRequestSession = req =>
    deserialize(req.headers[SEPAL_SESSION_HEADER])

export const setRequestSession = (req, {sessionId, workerType}) => {
    log.debug(() => `Injecting worker session into request headers: ${workerType} ${sessionId}`)
    req.headers[SEPAL_SESSION_HEADER] = serialize({sessionId, workerType})
}

export const removeRequestSession = req =>
    delete req.headers[SEPAL_SESSION_HEADER]

export {
    deserialize,
    getRequestUser,
    getSessionUsername,
    removeRequestUser,
    SEPAL_BUDGET_UPDATED_HEADER,
    SEPAL_USER_HEADER,
    SEPAL_USER_UPDATED_HEADER,
    serialize,
    setRequestUser,
    setSessionUsername}
