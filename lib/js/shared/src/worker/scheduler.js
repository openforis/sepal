const {Subject, ReplaySubject, of, catchError, filter, finalize, map, mergeMap, takeUntil, tap} = require('rxjs')
const {deserializeError} = require('serialize-error')
const {v4: uuid} = require('uuid')
const _ = require('lodash')
const log = require('#sepal/log').getLogger('scheduler')
const {workerTag} = require('./tag')
const {initWorker$} = require('./factory')
const {LimitedPool} = require('./pool')

const RATE_WINDOW_MS = 1000
const MAX_RATE = 10
const MAX_CONCURRENCY = 40
const MIN_IDLE_COUNT = 10
const MAX_IDLE_MS = 30000

let scheduler = null

const getScheduler = logConfig => {
    if (!scheduler) {
        scheduler = createScheduler(logConfig)
    }
    return scheduler
}

const createScheduler = logConfig => {
    const request$ = new Subject()
    const response$ = new Subject()
    const cancel$ = new Subject()

    const jobMsg = (requestTag, msg) =>
        `${requestTag} ${msg}`

    const workerMsg = (workerId, msg) =>
        `${workerTag(workerId)} ${msg}`

    const getOwnInstance = (instances, username) =>
        _.find(instances, instance => instance.username === username)

    const getIdleInstance = instances =>
        _.find(instances, instance => !instance.username)

    const workerPool$ = LimitedPool({
        name: 'Worker:userJob',
        maxIdleMilliseconds: MAX_IDLE_MS,
        minIdleCount: MIN_IDLE_COUNT,
        rateWindowMs: RATE_WINDOW_MS,
        maxRate: MAX_RATE,
        maxConcurrency: MAX_CONCURRENCY,
        findInstance: (instances, username) => getOwnInstance(instances, username) || getIdleInstance(instances),
        isIdle: instance => !instance.username,
        onUse: (instance, username) => instance.username = username,
        onIdle: instance => instance.username = null,
        create$: ({id: workerId}) => initWorker$({workerId, logConfig}),
        onMsg: ({id: workerId}, msg) => workerMsg(workerId, msg)
    })

    request$.pipe(
        tap(({requestTag, args}) => {
            const workerArgs = _.last(args)
            log.isTrace()
                ? _.isEmpty(workerArgs)
                    ? log.trace(jobMsg(requestTag, 'enqueued with no args'))
                    : log.trace(jobMsg(requestTag, 'enqueued with args'), workerArgs)
                : log.debug(() => jobMsg(requestTag, 'enqueued'))
        }),
        mergeMap(({username, jobName, jobPath, requestId, requestTag, initArgs, args, args$, cmd$}) =>
            workerPool$(username, requestTag).pipe(
                tap(() => log.debug(jobMsg(requestTag, 'dequeued'))),
                mergeMap(submit$ =>
                    submit$({jobName, jobPath, requestId, requestTag, initArgs, args, args$, cmd$}).pipe(
                        catchError(error => of({error})),
                        map(result => ({
                            requestId,
                            result
                        }))
                    )
                ),
                takeUntil(cancel$.pipe(
                    filter(({requestId: currentrequestId}) => currentrequestId === requestId),
                    tap(({requestTag}) => log.trace(() => jobMsg(requestTag, 'cancelled'))) // TODO: cancelled?
                ))
            )
        ),
    ).subscribe({
        next: response => response$.next(response),
        error: error => log.fatal('Worker manager request stream failed unexpectedly:', error),
        complete: () => log.fatal('Worker manager request stream completed unexpectedly')
    })

    return {
        submit$: ({username, jobName, jobPath, requestId = uuid(), requestTag, initArgs, args, args$, cmd$}) => {
            request$.next({username, jobName, jobPath, requestId, requestTag, initArgs, args, args$, cmd$})
            return jobResponse$(
                response$.pipe(
                    filter(({requestId: currentRequestId}) => currentRequestId === requestId),
                    map(({result}) => result),
                    finalize(() => {
                        log.trace(() => jobMsg(requestId, 'response$ finalized'))
                        cancel$.next({requestId, requestTag})
                    })
                )
            )
        }
    }
}

/**
 * Return an individual stream per request with unwrapped response
 * @param {Observable} wrapped$ The wrapped response
 */
const jobResponse$ = wrapped$ => {
    const unwrapped$ = new ReplaySubject() // short-lived
    const stop$ = new Subject()
    wrapped$.pipe(
        takeUntil(stop$)
    ).subscribe({
        next: ({next, error, complete, value}) => {
            next && unwrapped$.next(value)
            error && unwrapped$.error(deserializeError(value))
            complete && unwrapped$.complete()
        },
        error: error => unwrapped$.error(error),
        complete: () => unwrapped$.complete()
    })
    return unwrapped$.pipe(
        finalize(() => {
            log.trace(() => 'jobResponse$ finalized')
            stop$.next()
        })
    )
}

module.exports = {getScheduler}
