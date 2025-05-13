const {job} = require('#task/jobs/job')
const {eeLimiterService} = require('#sepal/ee/eeLimiterService')

const worker$ = () => {
    const log = require('#sepal/log').getLogger('ee')
    const {ReplaySubject, map, switchMap} = require('rxjs')
    const ee = require('#sepal/ee/ee')
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
            description: 'autenticate service account',
            operation: (resolve, reject) => {
                log.info('Authenticating service account')
                ee.sepal.setAuthType('SERVICE_ACCOUNT')
                ee.data.authenticateViaPrivateKey(serviceAccountCredentials, resolve, reject)
            }
        }).pipe(
            switchMap(() => getCurrentContext$()),
            map(({config}) => config.googleProjectId)
        )

    const authenticateUserAccount$ = userCredentials => {
        return ee.$({
            description: 'authenticate user account',
            operation: (resolve, reject) => {
                log.info(`Authenticating user account expiring ${userCredentials['access_token_expiry_date']}: ${!!userCredentials['access_token']}`)
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
    }

    const authenticate$ = context =>
        context.isUserAccount
            ? authenticateUserAccount$(context.userCredentials)
            : authenticateServiceAccount$(context.serviceAccountCredentials)

    const initialize$ = projectId =>
        ee.$({
            description: 'initialize',
            operation: (resolve, reject) => {
                ee.setMaxRetries(DEFAULT_MAX_RETRIES)
                ee.initialize(null, null, resolve, reject, null, projectId)
            }
        })

    const proceed$ = new ReplaySubject(1)

    const proceed = () => proceed$.closed || proceed$.complete()
    
    getContext$().pipe(
        switchMap(context => authenticate$(context)),
        switchMap(projectId => initialize$(projectId))
    ).subscribe({
        next: () => {
            log.info('Initialized EE')
            proceed()
        },
        error: error => {
            log.error('Failed to initialize EE', error)
            proceed()
        },
        complete: () => {
            log.error('Context monitoring is not suppose to complete!')
            proceed()
        }
    })

    return proceed$
}

module.exports = job({
    jobName: 'EE Initialization',
    services: [eeLimiterService],
    worker$
})
