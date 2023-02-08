const {delete$, get$, post$} = require('#sepal/httpClient')
const {filter, first, interval, map, switchMap} = require('rxjs')
const {
    username,
    endpoint,
    endpointPassword
} = require('./config')
const {println} = require('./console')

const WAIT_TIME = 5 * 1000

const endpointConfig = {
    username: 'sepalAdmin',
    password: endpointPassword,
    headers: {'sepal-user': JSON.stringify({username, roles: ['application_admin']})}
}

const exceededBudget = info => {
    const spending = info.spending
    const exceeded = (spending, budget, message) => {
        if (spending >= budget) {
            println(`\n${message}`)
            return true
        } else {
            return false
        }
    }
    return exceeded(spending.monthlyInstanceSpending, spending.monthlyInstanceBudget, 'You have spent more than you have been allocated on instances. Please contact a system administrator to increase your allocation.')
        || exceeded(spending.monthlyStorageSpending, spending.monthlyStorageBudget, 'You have spent more than you have been allocated on storage. Please contact a system administrator to increase your allocation.')
        || exceeded(spending.storageUsed, spending.storageQuota, 'You have used up more storage than you are allocated. Please contact a system administrator to increase your allocation.')
}

const sandboxInfo$ = () => {
    return get$(`${endpoint}sessions/${username}/report`, endpointConfig).pipe(
        map(response => JSON.parse(response.body)),
        map(info => ({...info, exceededBudget: exceededBudget(info)}))
    )
}

const joinSession$ = session => {
    const loadSession$ = () =>
        post$(`${endpoint}${session.path}`, endpointConfig).pipe(
            map(response => JSON.parse(response.body))
        )
    return interval(WAIT_TIME).pipe( // Retry until session is not starting
        switchMap(() => loadSession$()),
        filter(session => session.status !== 'STARTING'),
        first()
    )
}

const terminateSession$ = instanceType => {
    return delete$(`${endpoint}${instanceType.path}`, endpointConfig)
}

const createSession$ = instanceType => {
    return post$(`${endpoint}${instanceType.path}`, endpointConfig).pipe(
        switchMap(response => {
            const createdSession = JSON.parse(response.body)
            return joinSession$(createdSession)
        })
    )
}

module.exports = {
    createSession$,
    joinSession$,
    sandboxInfo$,
    terminateSession$
}
