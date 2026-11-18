import _ from 'lodash'

import {getLogger} from '#sepal/log'
import {storedUsername} from '#sepal/username'

import {usernameTag} from './tag.js'

const log = getLogger('user')

const SEPAL_USER_HEADER = 'sepal-user'
// Keep the legacy wire name: sandbox apps may read this API-key context.
export const API_KEY_CONTEXT_HEADER = 'sepal-session'
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

const getBrowserSessionUsername = req =>
    req.session.username

const setBrowserSessionUsername = (req, username) =>
    req.session.username = storedUsername(username)

const getRequestUser = req =>
    deserialize(req.headers[SEPAL_USER_HEADER])

const setRequestUser = (req, user) => {
    const userInfo = {
        ..._.pick(user, ['id', 'username', 'googleTokens', 'status', 'roles', 'systemUser', 'admin']),
        username: storedUsername(user.username)
    }
    // Apply the key's privilege limit on every injection, including after a Google token refresh.
    if (req.authenticatedWithApiKey) {
        userInfo.roles = userInfo.roles?.filter(role => role !== 'application_admin')
        userInfo.admin = false
        userInfo.systemUser = false
    }
    log.isTrace()
        ? log.trace(`${usernameTag(user.username)} Injecting user into request headers:`, userInfo)
        : log.isDebug() && log.debug(`${usernameTag(user.username)} Injecting user into request headers`)
    req.headers[SEPAL_USER_HEADER] = serialize(userInfo)
}

const removeRequestUser = req =>
    delete req.headers[SEPAL_USER_HEADER]

export const getApiKeyContext = req =>
    deserialize(req.headers[API_KEY_CONTEXT_HEADER])

export const setApiKeyContext = (req, {sessionId, workerType, taskId}) => {
    log.debug(() => `Injecting API-key context into request headers: ${workerType} ${sessionId ?? taskId}`)
    req.headers[API_KEY_CONTEXT_HEADER] = serialize({sessionId, workerType, taskId})
}

export const removeApiKeyContext = req =>
    delete req.headers[API_KEY_CONTEXT_HEADER]

export {
    deserialize,
    getBrowserSessionUsername,
    getRequestUser,
    removeRequestUser,
    SEPAL_BUDGET_UPDATED_HEADER,
    SEPAL_USER_HEADER,
    SEPAL_USER_UPDATED_HEADER,
    serialize,
    setBrowserSessionUsername,
    setRequestUser}
