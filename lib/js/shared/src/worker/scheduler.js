const {Subject, of, catchError, finalize, map, mergeMap, takeUntil, tap, ReplaySubject} = require('rxjs')
const {deserializeError} = require('serialize-error')
const {v4: uuid} = require('uuid')
const _ = require('lodash')
const {getLogger} = require('#sepal/log')
const {initWorker$} = require('./factory')
const {StaticPool} = require('./staticPool')

const log = getLogger('scheduler')

const schedulers = {}

const initScheduler = (config = {}) => {
    if (!config.name) {
        throw new Error('Missing scheduler name')
    }
    if (schedulers[config.name]) {
        throw new Error(`Duplicate scheduler name: ${config.name}`)
    }
    log.debug(`Initializing scheduler: ${config.name}`)
    schedulers[config.name] = createScheduler(config)
}

const getScheduler = name => {
    if (!name) {
        throw new Error('Missing scheduler name')
    }
    const scheduler = schedulers[name]
    if (!scheduler) {
        throw new Error('Cannot get a scheduler before it is initialized')
    }
    return scheduler
}

const createScheduler = ({name, strategy, instances = 2, createConcurrency = 1, createDelayMs = 0}) => {
    const request$ = new Subject()

    const jobMsg = (requestTag, msg) =>
        `${requestTag} ${msg}`

    const workerPool$ = StaticPool({
        name,
        strategy,
        instances,
        createConcurrency,
        createDelayMs,
        create$: workerId => initWorker$({workerId})
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
        mergeMap(({username, jobName, jobPath, requestId, requestTag, initArgs, args, arg$, cmd$, response$, cancel$, release$}) =>
            workerPool$(username, requestTag).pipe(
                tap(() => log.debug(jobMsg(requestTag, 'dequeued'))),
                mergeMap(submit$ =>
                    submit$({jobName, jobPath, requestId, requestTag, initArgs, args, arg$, cmd$, cancel$}).pipe(
                        catchError(error => of({error})),
                        map(result => ({response$, result})),
                        finalize(() => release$.next())
                    )
                ),
                takeUntil(release$)
            )
        )
    ).subscribe({
        next: ({response$, result: {next, error, complete, value}}) => {
            next && response$.next({next: true, value})
            error && response$.next({error: true, value: deserializeError(value)})
            complete && response$.next({complete: true})
        },
        error: error => log.fatal('Worker manager request stream failed unexpectedly:', error),
        complete: () => log.fatal('Worker manager request stream completed unexpectedly')
    })

    return {
        submit$: ({username, jobName, jobPath, requestId = uuid(), requestTag, initArgs, args, arg$, cmd$}) => {
            const isolatedResponse$ = new Subject()
            const response$ = new Subject()
            const cancel$ = new ReplaySubject(1)
            const release$ = new ReplaySubject(1)

            response$.subscribe({
                next: ({next, error, complete, value}) => {
                    next && isolatedResponse$.next(value)
                    error && isolatedResponse$.error(value)
                    complete && isolatedResponse$.complete()
                },
                error: error => isolatedResponse$.error(error),
                complete: () => isolatedResponse$.complete()
            })

            setImmediate(() =>
                request$.next({username, jobName, jobPath, requestId, requestTag, initArgs, args, arg$, cmd$, response$, cancel$, release$})
            )

            return isolatedResponse$.pipe(
                finalize(() => cancel$.next())
            )
        }
    }
}

module.exports = {initScheduler, getScheduler}
