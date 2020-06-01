const {Subject, ReplaySubject, of} = require('rxjs')
const {mergeMap, map, filter, finalize, takeUntil, catchError, tap} = require('rxjs/operators')
const {deserializeError} = require('serialize-error')
const {v4: uuid} = require('uuid')
const _ = require('lodash')
const log = require('sepal/log').getLogger('manager')
const {jobTag, workerTag} = require('./tag')
const {initWorker$} = require('./factory')
const {LimitedPool} = require('./pool')

const RATE_WINDOW_MS = 100
const MAX_RATE = 1
const MAX_CONCURRENCY = 100
const MIN_IDLE_COUNT = 10
const MAX_IDLE_MS = 5000

const workerManagers = {}

const getWorkerManager = ({
    jobName,
    jobPath,
    logConfig,
    maxConcurrency = MAX_CONCURRENCY,
    minIdleCount = MIN_IDLE_COUNT,
    maxIdleMilliseconds = MAX_IDLE_MS
}) => {
    if (!workerManagers[jobName]) {
        workerManagers[jobName] = createWorkerManager({
            jobName,
            jobPath,
            logConfig,
            maxConcurrency,
            minIdleCount,
            maxIdleMilliseconds
        })
    }
    return workerManagers[jobName]
}

/**
 * Return an individual stream per request with unwrapped response
 * @param {Observable} wrapped$ The wrapped response
 */
const jobResponse$ = wrapped$ => {
    const unwrapped$ = new ReplaySubject()
    const stop$ = new Subject()
    wrapped$.pipe(
        takeUntil(stop$)
    ).subscribe(
        ({next, error, complete, value}) => {
            next && unwrapped$.next(value)
            error && unwrapped$.error(deserializeError(value))
            complete && unwrapped$.complete()
        },
        error => unwrapped$.error(error),
        () => unwrapped$.complete()
    )
    return unwrapped$.pipe(
        finalize(() => stop$.next())
    )
}

const createWorkerManager = ({jobName, jobPath, logConfig, maxConcurrency, minIdleCount, maxIdleMilliseconds}) => {
    const request$ = new Subject()
    const response$ = new Subject()
    const cancel$ = new Subject()

    const jobMsg = (jobId, msg) => [
        `job [${jobTag(jobName, jobId)}]`,
        msg
    ].join(' ')

    const workerMsg = (workerId, msg) => [
        `worker [${workerTag(jobName, workerId)}]`,
        msg
    ].join(' ')
    
    const workerPool = LimitedPool({
        name: jobName,
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
        tap(({jobId, args}) => {
            const workerArgs = _.last(args)
            _.isEmpty(workerArgs)
                ? log.debug(jobMsg(jobId, 'enqueued with no args'))
                : log.debug(jobMsg(jobId, 'enqueued with args'), workerArgs)
        }),
        mergeMap(({jobId, args, args$}) =>
            workerPool.getInstance$().pipe(
                tap(() => log.debug(jobMsg(jobId, 'dequeued'))),
                mergeMap(worker =>
                    worker.submit$(jobId, args, args$).pipe(
                        catchError(error => of({error})),
                        map(result => ({
                            jobId,
                            result
                        }))
                    )
                ),
                takeUntil(cancel$.pipe(
                    filter(({jobId: currentJobId}) => currentJobId === jobId),
                    tap(({jobId}) => log.debug(jobMsg(jobId, 'cancelled')))
                ))
            )
        ),
    ).subscribe(
        response => response$.next(response),
        error => log.fatal('Worker manager request stream failed unexpectedly:', error),
        () => log.fatal('Worker manager request stream completed unexpectedly')
    )

    return {
        submit$({args, args$}) {
            const jobId = uuid()
            request$.next({jobId, args, args$})
            return jobResponse$(
                response$.pipe(
                    filter(({jobId: currentJobId}) => currentJobId === jobId),
                    map(({result}) => result),
                    finalize(() => cancel$.next({jobId}))
                )
            )
        }
    }
}

module.exports = {getWorkerManager}
