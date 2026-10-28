import {forkJoin, map} from 'rxjs'

import {get$} from '#sepal/httpClient'
import {getLogger} from '#sepal/log'

import {gatewayHost, sepalPassword, sepalUsername} from './config.js'

const log = getLogger('http')

const mergeMostRecent = (...objects) =>
    objects.reduce((acc, curr) => {
        Object.entries(curr).forEach(([key, dateString]) => {
            const date = new Date(dateString)
            if (!acc[key] || date > acc[key]) {
                acc[key] = date
            }
        })
        return acc
    }, {})

const getMostRecentLoginByUser$ = () => {
    log.debug(() => 'Getting most recent login by any user')
    return get$(`http://${gatewayHost}/api/user/mostRecentLoginByUser`, {
        username: sepalUsername,
        password: sepalPassword,
        responseType: 'json',
        retry: {
            maxRetries: -1
        }
    }).pipe(
        map(({body}) => body ?? {})
    )
}

const getMostRecentLogin$ = username => {
    log.debug(() => `Getting most recent login by user: ${username}`)
    return get$(`http://${gatewayHost}/api/user/mostRecentLogin`, {
        username: sepalUsername,
        password: sepalPassword,
        query: {
            username
        },
        responseType: 'json',
        retry: {
            maxRetries: -1
        }
    }).pipe(
        map(({body}) => toTimestamp(body, 'user/mostRecentLogin'))
    )
}

const getMostRecentSessionByUser$ = () => {
    log.debug(() => 'Getting most recent session by any user')
    return get$(`http://${gatewayHost}/api/sessions/mostRecentlyClosedByUser`, {
        username: sepalUsername,
        password: sepalPassword,
        responseType: 'json',
        retry: {
            maxRetries: -1
        }
    }).pipe(
        map(({body}) => body ?? {})
    )
}

const getMostRecentSession$ = username => {
    log.debug(() => `Getting most recent session by user: ${username}`)
    return get$(`http://${gatewayHost}/api/sessions/mostRecentlyClosed`, {
        username: sepalUsername,
        password: sepalPassword,
        query: {
            username
        },
        responseType: 'json',
        retry: {
            maxRetries: -1
        }
    }).pipe(
        map(({body}) => toTimestamp(body, 'sessions/mostRecentlyClosed'))
    )
}

// An empty body means no access was ever recorded. Any other body must carry a readable timestamp: a
// reshaped response would otherwise read as no access, and the user's storage would be erased.
const toTimestamp = (body, endpoint) => {
    if (isEmptyObject(body ?? {})) {
        return null
    }
    const timestamp = typeof body.timestamp === 'string' ? new Date(body.timestamp) : null
    if (!timestamp || isNaN(timestamp.getTime())) {
        throw new Error(`Unexpected response from ${endpoint}: ${JSON.stringify(body)}`)
    }
    return timestamp
}

const isEmptyObject = value =>
    typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0

const getMostRecentAccessByUser$ = () =>
    forkJoin([
        getMostRecentLoginByUser$(),
        getMostRecentSessionByUser$()
    ]).pipe(
        map(([mostRecentLoginByUser, mostRecentSessionByUser]) =>
            mergeMostRecent(mostRecentLoginByUser, mostRecentSessionByUser)
        )
    )

const getMostRecentAccess$ = username =>
    forkJoin([
        getMostRecentLogin$(username),
        getMostRecentSession$(username)
    ]).pipe(
        map(timestamps => latest(timestamps))
    )

const latest = timestamps =>
    timestamps.filter(Boolean).reduce((acc, timestamp) => timestamp > acc ? timestamp : acc, null)

const getUser$ = username => {
    log.debug(() => `Getting user: ${username}`)
    return get$(`http://${gatewayHost}/api/user/info`, {
        username: sepalUsername,
        password: sepalPassword,
        query: {
            username
        },
        responseType: 'json'
    }).pipe(
        map(({body}) => body ?? {})
    )
}

export {getMostRecentAccess$, getMostRecentAccessByUser$, getUser$}
