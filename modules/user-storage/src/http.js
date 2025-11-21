const {sepalHost, sepalUsername, sepalPassword} = require('./config')
const {get$} = require('#sepal/httpClient')
const {forkJoin, map} = require('rxjs')
const log = require('#sepal/log').getLogger('http')

const merge = (obj1, obj2) =>
    [obj1, obj2].reduce((acc, curr) => {
        Object.entries(curr).forEach(([user, dateString]) => {
            const date = new Date(dateString)
            if (!acc[user] || date > acc[user]) {
                acc[user] = date
            }
        })
        return acc
    }, {})

const getMostRecentLoginByUser$ = () => {
    log.debug(() => 'Getting most recent login by user')
    return get$(`https://${sepalHost}/api/user/mostRecentLoginByUser`, {
        username: sepalUsername,
        password: sepalPassword,
        retry: {
            maxRetries: -1
        }
    }).pipe(
        map(({body}) => body ? JSON.parse(body) : {})
    )
}

const getMostRecentSessionByUser$ = () => {
    log.debug(() => 'Getting most recent session by user')
    return get$(`https://${sepalHost}/api/sessions/mostRecentlyClosedByUser`, {
        username: sepalUsername,
        password: sepalPassword,
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
            merge(mostRecentLoginByUser, mostRecentSessionByUser)
        )
    )

const getUser$ = async username => {
    log.debug(() => `Getting user: ${username}`)
    return get$(`https://${sepalHost}/api/user/info`, {
        username: sepalUsername,
        password: sepalPassword,
        query: {
            username
        }
    }).pipe(
        map(({body}) => body ? JSON.parse(body) : {})
    )
}

module.exports = {getMostRecentAccessByUser$, getUser$}
