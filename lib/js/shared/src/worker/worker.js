const {parentPort} = require('worker_threads')
const {Subject, of, concat} = require('rx')
const {map, mergeMap, takeUntil, tap, filter, finalize} = require('rx/operators')
const {serializeError} = require('serialize-error')
const _ = require('lodash')
const service = require('sepal/service')
const Transport = require('./transport')
const log = require('sepal/log').getLogger('worker')
const {jobTag, workerTag, taskTag} = require('./tag')
const {toException} = require('sepal/exception')
const {WORKER} = require('./factory')

const exported = {}

const configureLog = config =>
    require('sepal/log').configureClient(config)

const initWorker = ({workerId, jobName, port}) => {
    const args$ = new Subject()
    const stop$ = new Subject()

    const workerMsg = msg =>
        `${workerTag(jobName, workerId)} ${msg}`

    const setupJob = ({request$, response$}) => {
        log.trace(workerMsg('setting up'))
        const start = ({jobId, jobPath, initArgs, args}) => {

            const jobMsg = (jobId, taskName, msg) =>
                workerMsg([
                    'running',
                    `${jobTag(jobName, jobId)}`,
                    `${taskTag(taskName)}`,
                    msg
                ].join(' '))
        
            const tasks = require(jobPath)(WORKER)
        
            const tasks$ = _.chain(tasks)
                .zip(args)
                .map(([{jobName, worker$}, args]) =>
                    of({jobName, worker$, args})
                )
                .value()

            const jobArgs$ = args$.pipe(
                filter(arg => arg.jobId === jobId),
                map(({value}) => value)
            )

            const runWorker$ = (worker$, initArgs, args, args$) =>
                worker$(...args, {initArgs, args$})
        
            const result$ = concat(...tasks$).pipe(
                tap(({jobName, args}) =>
                    log.isTrace()
                        ? _.isEmpty(args)
                            ? log.trace(() => jobMsg(jobId, jobName, 'with no args'))
                            : log.trace(() => jobMsg(jobId, jobName, 'with args'), args)
                        : log.debug(() => jobMsg(jobId, jobName))
                ),
                mergeMap(({worker$, args}) => runWorker$(worker$, initArgs, args, jobArgs$), 1),
                takeUntil(stop$),
                finalize(() => {
                    log.trace('result$ finalized')
                    stop()
                })
            )
    
            result$.subscribe({
                next: value => response$.next(({jobId, next: true, value})),
                error: error => response$.next({jobId, error: true, value: serializeError(toException(error))}),
                complete: () => response$.next({jobId, complete: true})
            })
        }
        
        const stop = () =>
            stop$.next()
        
        const next = ({jobId, value}) =>
            args$.next({jobId, value})

        request$.pipe(
            takeUntil(stop$),
            finalize(() => {
                log.trace('request$ finalized')
                stop()
            })
        ).subscribe(
            message => {
                message.start && start(message.start)
                message.next && next(message.next)
            },
            error => log.fatal(workerMsg('request stream failed unexpectedly:'), error),
            // stream is allowed to complete
        )
    }

    const id = workerTag(jobName, workerId)

    const transport = Transport({id: 'worker', port})

    transport.onChannel({
        [id]: ({in$: response$, out$: request$}) => setupJob({request$, response$}),
    })

    service.initialize({transport, id})

    log.debug(workerMsg('initialized'))
}

const ready = () =>
    parentPort.postMessage({ready: true})

parentPort.once('message', ({workerId, jobName, logConfig, port}) => {
    exported.port = port
    configureLog(logConfig)
    initWorker({workerId, jobName, port})
    ready()
})

module.exports = exported
