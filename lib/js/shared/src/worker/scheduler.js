const {Subject, of, catchError, finalize, map, mergeMap, takeUntil, tap, first, EMPTY, ReplaySubject} = require('rxjs')
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
        mergeMap(({username, jobName, jobPath, requestId, requestTag, initArgs, args, args$, cmd$, response$, cancel$}) =>
            workerPool$(username, requestTag).pipe(
                tap(() => log.debug(jobMsg(requestTag, 'dequeued'))),
                mergeMap(submit$ =>
                    submit$({jobName, jobPath, requestId, requestTag, initArgs, args, args$, cmd$}).pipe(
                        catchError(error => of({error})),
                        map(result => ({response$, result}))
                    )
                ),
                takeUntil(cancel$.pipe(first()))
            )
        ),
    ).subscribe({
        next: ({response$, result: {next, error, complete, value}}) => {
            next && response$.next(value)
            error && response$.error(deserializeError(value))
            complete && response$.complete()
        },
        error: error => log.fatal('Worker manager request stream failed unexpectedly:', error),
        complete: () => log.fatal('Worker manager request stream completed unexpectedly')
    })

    return {
        submit$: ({username, jobName, jobPath, requestId = uuid(), requestTag, initArgs, args, args$, cmd$}) => {
            const response$ = new Subject()
            const cancel$ = new ReplaySubject(1)
            setImmediate(() =>
                request$.next({username, jobName, jobPath, requestId, requestTag, initArgs, args, args$, cmd$, response$, cancel$})
            )
            return response$.pipe(
                takeUntil(cancel$),
                finalize(() => cancel$.next())
            )
        }
    }
}

module.exports = {initScheduler, getScheduler}
