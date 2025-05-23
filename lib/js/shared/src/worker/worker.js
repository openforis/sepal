const {parentPort, workerData} = require('worker_threads')
const {Subject, of, concat, concatMap, filter, finalize, map, takeUntil, tap} = require('rxjs')
const {serializeError} = require('serialize-error')
const service = require('#sepal/service')
const log = require('#sepal/log').getLogger('worker')
const {workerTag, taskTag} = require('./tag')
const {toException} = require('#sepal/exception')
const {WORKER} = require('./factory')
const {PortTransport} = require('../rxjs/transport/port')

const exported = {}

const configureLog = config =>
    config && require('#sepal/log').configureClient(config)

const initWorker = ({workerId}) => {
    const workerMsg = msg =>
        `${workerTag(workerId)} ${msg}`

    // initWorkerMetrics({workerId, jobName})

    const runJob = ({request$, response$}) => {
        const args$ = new Subject()
        const cmd$ = new Subject()
        const stop$ = new Subject()
    
        log.trace(() => workerMsg('setting up'))

        const start = ({requestId, requestTag, jobName, jobPath, initArgs, args}) => {
            const jobMsg = (taskName, msg) => [
                requestTag,
                workerMsg(`${taskTag(taskName)} ${msg || ''}`)
            ].join(' ')

            const tasks = require(jobPath)(WORKER)
            const state = {}
        
            const tasks$ = concat(
                ...tasks.map(({jobName, worker$, finalize$}, index) =>
                    of({jobName, worker$, finalize$, args: args[index]})
                )
            )

            const jobArgs$ = args$.pipe(
                filter(arg => arg.requestId === requestId),
                map(({value}) => value)
            )

            const jobCmd$ = cmd$.pipe(
                filter(arg => arg.requestId === requestId),
                map(({cmd}) => cmd)
            )

            const workerLog = (jobName, phase, args) =>
                log.isTrace()
                    ? args === undefined
                        ? log.trace(jobMsg(jobName, `${phase} with no args`))
                        : log.trace(jobMsg(jobName, `${phase} with args`), args)
                    : log.debug(() => jobMsg(jobName, phase))

            const worker$ = tasks$.pipe(
                tap(() => workerLog(jobName, 'worker$ running', args)),
                concatMap(({worker$, args}) =>
                    worker$({...args, requestId, requestTag, initArgs, jobArgs$, jobCmd$, state})
                ),
                takeUntil(stop$),
                finalize(() => {
                    workerLog(jobName, 'worker$ finalized')
                    stop()
                    finalize$.subscribe({
                        error: error => response$.next({requestId, error: true, value: serializeError(toException(error))}),
                    })
                })
            )

            const finalize$ = tasks$.pipe(
                tap(() => workerLog(jobName, 'finalize$ running', args)),
                concatMap(({finalize$, args}) =>
                    finalize$({...args, requestId, requestTag, initArgs, state})
                ),
                finalize(() => {
                    workerLog(jobName, 'finalize$ finalized')
                    response$.complete()
                    stop()
                })
            )

            worker$.subscribe({
                next: value => response$.next(({requestId, next: true, value})),
                error: error => response$.next({requestId, error: true, value: serializeError(toException(error))}),
                complete: () => response$.next({requestId, complete: true})
            })
        }
        
        const stop = () => {
            stop$.next()
        }
        
        const next = ({requestId, ...msg}) => {
            msg.value && args$.next({requestId, value: msg.value})
            msg.cmd && cmd$.next({requestId, cmd: msg.cmd})
        }

        request$.pipe(
            takeUntil(stop$),
            finalize(() => {
                log.trace(() => workerMsg('request stream finalized'))
                stop()
            })
        ).subscribe({
            next: message => {
                message.start && start(message.start)
                message.next && next(message.next)
            },
            error: error => log.fatal(workerMsg('request stream failed unexpectedly:'), error)
            // stream is allowed to complete
        })
    }

    const transportId = workerTag(workerId)
    const transport = PortTransport({
        transportId,
        port: parentPort,
        onChannel: {
            'job': ({in$: response$, out$: request$}) => runJob({request$, response$})
        }
    })

    service.initialize(transport)

    log.debug(() => workerMsg('initialized'))
}

const ready = () =>
    parentPort.postMessage({ready: true})

const {workerId, logConfig} = workerData
configureLog(logConfig)
initWorker({workerId})
ready()

module.exports = exported
