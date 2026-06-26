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
        retry: {
            maxRetries: -1
        }
    }).pipe(
        map(({body}) => body ? JSON.parse(body) : {})
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
        retry: {
            maxRetries: -1
        }
    }).pipe(
        map(({body}) => body ? JSON.parse(body) : {})
    )
}

const getMostRecentSessionByUser$ = () => {
    log.debug(() => 'Getting most recent session by any user')
    return get$(`http://${gatewayHost}/api/sessions/mostRecentlyClosedByUser`, {
        username: sepalUsername,
        password: sepalPassword,
        retry: {
            maxRetries: -1
        }
    }).pipe(
        map(({body}) => body ? JSON.parse(body) : {})
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
        retry: {
            maxRetries: -1
        }
    }).pipe(
        map(({body}) => body ? JSON.parse(body) : {})
    )
}

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
        map(([mostRecentLoginByUser, mostRecentSessionByUser]) =>
            mergeMostRecent(mostRecentLoginByUser, mostRecentSessionByUser)
        ),
        map(({timestamp}) => timestamp)
    )

const getUser$ = username => {
    log.debug(() => `Getting user: ${username}`)
    return get$(`http://${gatewayHost}/api/user/info`, {
        username: sepalUsername,
        password: sepalPassword,
        query: {
            username
        }
    }).pipe(
        map(({body}) => body ? JSON.parse(body) : {})
    )
}

export {getMostRecentAccess$, getMostRecentAccessByUser$, getUser$}
