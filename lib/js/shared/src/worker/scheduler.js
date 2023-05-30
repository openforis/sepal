const {Subject, ReplaySubject, of, catchError, filter, finalize, map, mergeMap, takeUntil, tap} = require('rxjs')
const {deserializeError} = require('serialize-error')
const {v4: uuid} = require('uuid')
const _ = require('lodash')
const {getLogger} = require('#sepal/log')
const {initWorker$} = require('./factory')
const {StaticPool} = require('./staticPool')

const log = getLogger('scheduler')

let scheduler = null

const initScheduler = (config = {}) => {
    scheduler = createScheduler(config)
}

const getScheduler = () => {
    if (!scheduler) {
        throw new Error('Cannot invoke getScheduler() before initScheduler()')
    }
    return scheduler
}

const createScheduler = ({instances = 2, createConcurrency = 1, createDelayMs = 0}) => {
    const request$ = new Subject()
    const response$ = new Subject()
    const cancel$ = new Subject()

    const jobMsg = (requestTag, msg) =>
        `${requestTag} ${msg}`

    const workerPool$ = StaticPool({
        name: 'Worker',
        instances,
        createConcurrency,
        createDelayMs,
        create$: workerId => initWorker$({workerId}),
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

module.exports = {initScheduler, getScheduler}
