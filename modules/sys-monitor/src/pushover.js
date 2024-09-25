const {Subject, mergeMap, catchError, of, map} = require('rxjs')
const {pushoverApiKey, pushoverGroupKey, notifyFrom, emergencyNotificationRetryDelay, emergencyNotificationRetryTimeout} = require('./config')
const {post$} = require('#sepal/httpClient')
const log = require('#sepal/log').getLogger('pushover')

const PUSHOVER_URL = 'https://api.pushover.net/1/messages.json'
const PUSHOVER_CONCURRENCY = 2 // max allowed by Pushover

const notification$ = new Subject()

const sendNotification$ = ({message, priority = 0}) =>
    post$(PUSHOVER_URL, {
        body: {
            token: pushoverApiKey,
            user: pushoverGroupKey,
            message: `[${notifyFrom}] ${message}`,
            priority,
            retry: emergencyNotificationRetryDelay,
            expire: emergencyNotificationRetryTimeout
        }
    }).pipe(
        map(() => ({message, priority})),
        catchError(error => of({message, priority, error}))
    )

notification$.pipe(
    mergeMap(notification => sendNotification$(notification), PUSHOVER_CONCURRENCY)
).subscribe({
    next: ({message, priority}) => log.info(`Pushover notification sent: ${message} (priority: ${priority})`),
    error: error => log.error('Pushover notification$ error (unexpected)', error),
    complete: () => log.error('Pushover notification$ complete (unexpected)')
})

const notify = ({message, priority}) =>
    notification$.next({message, priority})

module.exports = {notify}
