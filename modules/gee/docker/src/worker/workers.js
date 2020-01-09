const {Subject, of} = require('rxjs')
const {mergeMap, map, filter, finalize, takeUntil, catchError} = require('rxjs/operators')
const {v4: uuid} = require('uuid')
const _ = require('lodash')
const log = require('sepalLog')('job')
const {initWorker$} = require('./factory')
const {LimitedPool} = require('../pool')

const RATE_WINDOW_MS = 100
const MAX_RATE = 1
const MAX_CONCURRENCY = 100
const MIN_IDLE_COUNT = 10
const MAX_IDLE_MS = 5000

const workers = {}

const getWorker = ({
    jobName,
    jobPath,
    maxConcurrency = MAX_CONCURRENCY,
    minIdleCount = MIN_IDLE_COUNT,
    maxIdleMilliseconds = MAX_IDLE_MS
}) => {
    if (!workers[jobName]) {
        workers[jobName] = createWorker({
            jobName,
            jobPath,
            maxConcurrency,
            minIdleCount,
            maxIdleMilliseconds
        })
    }
    return workers[jobName]
}

const createWorker = ({jobName, jobPath, maxConcurrency, minIdleCount, maxIdleMilliseconds}) => {
    const workerRequest$ = new Subject()
    const workerResponse$ = new Subject()
    const cancel$ = new Subject()

    const pool = LimitedPool({
        name: jobName,
        maxIdleMilliseconds,
        minIdleCount,
        rateWindowMs: RATE_WINDOW_MS,
        maxRate: MAX_RATE,
        maxConcurrency,
        create$: instanceId => initWorker$(instanceId, jobPath),
        onDispose: ({item}) => item.dispose(),
        onMsg: ({instanceId, action}) => `Worker instance [${instanceId}] ${action}`
    })

    workerRequest$.pipe(
        mergeMap(({requestId, args, args$}) =>
            pool.getInstance$().pipe(
                mergeMap(worker =>
                    worker.submit$(args, args$).pipe(
                        catchError(error => of({error})),
                        map(result => ({
                            requestId,
                            result
                        }))
                    )
                ),
                takeUntil(cancel$.pipe(
                    filter(({requestId: currentRequestId}) => currentRequestId === requestId)
                ))
            )
        ),
    ).subscribe(
        response => workerResponse$.next(response),
        error => log.fatal('Pooled worker request stream failed:', error),
        () => log.fatal('Pooled worker request stream completed')
    )

    return {
        submit$({args, args$}) {
            log.debug(`Submitting job [${jobName}] to pooled worker`)
            const requestId = uuid()
            workerRequest$.next({requestId, args, args$})
            return workerResponse$.pipe(
                filter(({requestId: currentRequestId}) => currentRequestId === requestId),
                map(({result}) => result),
                finalize(() => {
                    cancel$.next({requestId})
                })
            )
        }
    }
}

module.exports = getWorker
