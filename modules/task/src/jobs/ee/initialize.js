const {job} = require('#task/jobs/job')
const {eeLimiterService} = require('#sepal/ee/eeLimiterService')

const worker$ = () => {
    const {ReplaySubject, map, switchMap} = require('rxjs')
    const ee = require('#sepal/ee')
    const {getContext$, getCurrentContext$} = require('#task/jobs/service/context')
    
    const DEFAULT_MAX_RETRIES = 10

    const secondsToExpiration = expiration => {
        const millisecondsLeft = expiration - Date.now()
        if (millisecondsLeft < 0) {
            throw new Error('Token expired')
        }
        return millisecondsLeft / 1000
    }

    const authenticateServiceAccount$ = serviceAccountCredentials =>
        ee.$({
            operation: 'autenticate service account',
            ee: (resolve, reject) => {
                ee.sepal.setAuthType('SERVICE_ACCOUNT')
                ee.data.authenticateViaPrivateKey(serviceAccountCredentials, resolve, reject)
            }
        }).pipe(
            switchMap(() => getCurrentContext$()),
            map(({config}) => config.googleProjectId)
        )

    const authenticateUserAccount$ = userCredentials =>
        ee.$({
            operation: 'authenticate user account',
            ee: (resolve, reject) => {
                ee.sepal.setAuthType('USER')
                ee.data.setAuthToken(
                    null,
                    'Bearer',
                    userCredentials['access_token'],
                    secondsToExpiration(userCredentials['access_token_expiry_date']),
                    null,
                    error => error ? reject(error) : resolve(),
                    false
                )
            }
        }).pipe(
            map(() => userCredentials.project_id)
        )

    const authenticate$ = context =>
        context.isUserAccount
            ? authenticateUserAccount$(context.userCredentials)
            : authenticateServiceAccount$(context.serviceAccountCredentials)

    const initialize$ = projectId =>
        ee.$({
            operation: 'initialize',
            ee: (resolve, reject) => {
                ee.setMaxRetries(DEFAULT_MAX_RETRIES)
                ee.initialize(null, null, resolve, reject, null, projectId)
            }
        })

    const ready$ = new ReplaySubject()

    getContext$().pipe(
        switchMap(context => authenticate$(context)),
        switchMap(projectId => initialize$(projectId))
    ).subscribe({
        next: () => {
            log.info('Initialized EE')
            ready$.closed || ready$.complete()
        },
        error: error => {
            log.error('Failed to initialize EE', error)
            ready$.closed || ready$.complete()
        },
        complete: () => {
            log.error('Context monitoring is not suppose to complete!')
            ready$.closed || ready$.complete()
        }
    })

    return ready$
}

module.exports = job({
    jobName: 'EE Initialization',
    services: [eeLimiterService],
    worker$
})
