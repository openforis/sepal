import {catchError, filter, first, forkJoin, interval, map, of, switchMap} from 'rxjs'

import {delete$, get$, post$} from '#sepal/httpClient'

import {endpoint, endpointPassword, username} from './config.js'
import {println} from './console.js'

// Session-start poll (also a keep-alive heartbeat). 1s: the poll quantizes the user's
// wait after the session goes ACTIVE, and the POST costs the worker ~2ms.
const WAIT_TIME = 1000

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

// The budget module owns spending: the worker report does not carry it, so the menu fetches it
// directly and merges.
const budgetEndpoint = process.env.BUDGET_ENDPOINT || 'http://budget/'

const spending$ = () =>
    get$(`${budgetEndpoint}budget/spending/${username}`, {...endpointConfig, responseType: 'json'}).pipe(
        map(({body}) => body)
    )

const report$ = () =>
    get$(`${endpoint}sessions/${username}/report`, {...endpointConfig, responseType: 'json'}).pipe(
        map(({body}) => body)
    )

// sessionLabel$ — "{menu ID}: {name}" for a session, the two things the menu's table showed for it,
// used as the GUI terminal tab's name. Both come from the report: the ID is a position in that
// list, and a session the user has just created has no position until the report carries it.
// Emits null rather than failing — a tab name is not worth withholding the user's shell over.
const sessionLabel$ = session =>
    report$().pipe(
        map(({sessions}) => {
            const index = sessions.findIndex(({id}) => id === session.id)
            const name = sessions[index]?.name
            return name ? `${index + 1}: ${name}` : null
        }),
        catchError(() => of(null))
    )

const sandboxInfo$ = () => {
    return forkJoin([report$(), spending$()]).pipe(
        map(([report, spending]) => ({...report, spending})),
        map(info => ({...info, exceededBudget: exceededBudget(info)}))
    )
}

const parsedCode = body => {
    try {
        return JSON.parse(body)?.code
    } catch (_error) {
        return undefined
    }
}

// failureReason — the worker answers a rejected create with 503 {code} for launch failures
// the user can act on (see the worker's instanceLaunchErrors.js); anything else is FAILED.
// Called with both a response, whose body `responseType: 'json'` has already parsed, and a
// thrown error, whose body the http client always leaves as raw text.
const failureReason = ({body} = {}) => {
    const code = typeof body === 'string' ? parsedCode(body) : body?.code
    return ['INSTANCE_UNAVAILABLE', 'QUOTA_EXCEEDED'].includes(code) ? code : 'FAILED'
}

// joinSession$ — emits the session once it leaves STARTING, or an {unavailable, reason}
// sentinel when it disappears mid-start: the worker closes a session whose instance could
// not be provisioned, and the poll then answers 404. No failure reason survives a closed
// session, so this maps to FAILED (the generic trouble-starting message).
const joinSession$ = session => {
    const loadSession$ = () =>
        post$(`${endpoint}${session.path}`, {...endpointConfig, responseType: 'json', validStatuses: [404]}).pipe(
            map(response => response.statusCode === 404
                ? {unavailable: true, reason: 'FAILED'}
                : response.body)
        )
    return interval(WAIT_TIME).pipe( // Retry until session is not starting
        switchMap(() => loadSession$()),
        filter(session => session.unavailable || session.status !== 'STARTING'),
        first()
    )
}

const terminateSession$ = instanceType => {
    return delete$(`${endpoint}${instanceType.path}`, endpointConfig)
}

// terminalOpened$ — the one-shot "terminal opened" extension, replacing alive.sh. An open-but-
// untouched SSH connection is exactly what has been decided should NOT extend a session, so there
// is no keep-alive loop any more: from here on, pty atime sampled inside the container is the
// terminal's interaction signal (docs/session-expiration-model.md §4b).
//
// This one-shot has no successor to re-assert it, so it is retried; if it still fails, the user
// simply keeps whatever lease the session already had and the first keystroke picks the signal up
// on the next sampler tick. Errors are swallowed rather than printed: stdout here is the user's
// terminal, and a failed extension is not something they can act on.
const terminalOpened$ = session =>
    post$(`${endpoint}sessions/session/${session.id}/opened`, {
        ...endpointConfig, responseType: 'json', validStatuses: [404, 409]
    }).pipe(
        catchError(() => of(null))
    )

// createSession$ — the {unavailable, reason} sentinel covers both a rejected create request
// (reason from the worker's 503 {code}, FAILED otherwise) and a session the worker closed
// while it was starting (see joinSession$). The 503 must arrive as a response, not an error:
// httpClient retries >=500 errors with backoff, which would delay a capacity failure that
// retrying cannot fix.
const createSession$ = instanceType => {
    return post$(`${endpoint}${instanceType.path}`, {...endpointConfig, responseType: 'json', validStatuses: [503]}).pipe(
        switchMap(response => response.statusCode === 503
            ? of({unavailable: true, reason: failureReason(response)})
            : joinSession$(response.body)),
        catchError(error => of({unavailable: true, reason: failureReason(error)}))
    )
}

export {
    createSession$,
    joinSession$,
    sandboxInfo$,
    sessionLabel$,
    terminalOpened$,
    terminateSession$
}
