const {Subject, ReplaySubject, of, catchError, filter, finalize, map, mergeMap, takeUntil, tap} = require('rxjs')
const {deserializeError} = require('serialize-error')
const {v4: uuid} = require('uuid')
const _ = require('lodash')
const log = require('#sepal/log').getLogger('scheduler')
const {jobTag, workerTag} = require('./tag')
const {initWorker$} = require('./factory')
const {LimitedPool} = require('./pool')

const RATE_WINDOW_MS = 100
const MAX_RATE = 1
const MAX_CONCURRENCY = 100
const MIN_IDLE_COUNT = 10
const MAX_IDLE_MS = 5000

const jobSchedulers = {}

const getJobScheduler = ({
    jobName,
    jobPath,
    logConfig,
    maxConcurrency = MAX_CONCURRENCY,
    minIdleCount = MIN_IDLE_COUNT,
    maxIdleMilliseconds = MAX_IDLE_MS
}) => {
    if (!jobSchedulers[jobName]) {
        jobSchedulers[jobName] = createJobScheduler({
            jobName,
            jobPath,
            logConfig,
            maxConcurrency,
            minIdleCount,
            maxIdleMilliseconds
        })
    }
    return jobSchedulers[jobName]
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

const createJobScheduler = ({jobName, jobPath, logConfig, maxConcurrency, minIdleCount, maxIdleMilliseconds}) => {
    const request$ = new Subject()
    const response$ = new Subject()
    const cancel$ = new Subject()

    const jobMsg = (requestTag, msg) =>
        `${requestTag} ${jobTag(jobName)} ${msg}`

    const workerMsg = (workerId, msg) =>
        `${workerTag(jobName, workerId)} ${msg}`
    
    const workerPool = LimitedPool({
        name: `Worker:${jobName}`,
        maxIdleMilliseconds,
        minIdleCount,
        rateWindowMs: RATE_WINDOW_MS,
        maxRate: MAX_RATE,
        maxConcurrency,
        create$: ({instanceId: workerId}) => initWorker$({workerId, jobName, jobPath, logConfig}),
        onDispose: ({item}) => item.dispose(),
        onMsg: ({instanceId: workerId, action}) => workerMsg(workerId, action)
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
        mergeMap(({requestId, requestTag, initArgs, args, args$, cmd$}) =>
            workerPool.getInstance$().pipe(
                tap(() => log.debug(jobMsg(requestTag, 'dequeued'))),
                mergeMap(worker =>
                    worker.submit$({requestId, requestTag, initArgs, args, args$, cmd$}).pipe(
                        catchError(error => of({error})),
                        map(result => ({
                            requestId,
                            result
                        }))
                    )
                ),
                takeUntil(cancel$.pipe(
                    filter(({requestId: currentrequestId}) => currentrequestId === requestId),
                    tap(({requestTag}) => log.debug(() => jobMsg(requestTag, 'cancelled'))) // TODO: cancelled?
                ))
            )
        ),
    ).subscribe({
        next: response => response$.next(response),
        error: error => log.fatal('Worker manager request stream failed unexpectedly:', error),
        complete: () => log.fatal('Worker manager request stream completed unexpectedly')
    })

    return {
        submit$: ({requestId = uuid(), requestTag, initArgs, args, args$, cmd$}) => {
            request$.next({requestId, requestTag, initArgs, args, args$, cmd$})
            return jobResponse$(
                response$.pipe(
                    filter(({requestId: currentRequestId}) => currentRequestId === requestId),
                    map(({result}) => result),
                    finalize(() => {
                        log.trace(() => jobMsg(requestId, 'response$ finalized'))
                        cancel$.next({requestId})
                    })
                )
            )
        }
    }
}

module.exports = {getJobScheduler}
