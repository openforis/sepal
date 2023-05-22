const {parentPort, workerData} = require('worker_threads')
const {ReplaySubject, Subject, of, concat, filter, finalize, map, mergeMap, takeUntil, tap} = require('rxjs')
const {serializeError} = require('serialize-error')
const _ = require('lodash')
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
        const cmd$ = new ReplaySubject()
        const stop$ = new Subject()
    
        log.trace(() => workerMsg('setting up'))

        const start = ({requestId, requestTag, jobName, jobPath, initArgs, args}) => {
            const jobMsg = (taskName, msg) => [
                requestTag,
                workerMsg(`running ${taskTag(taskName)} ${msg || ''}`)
            ].join(' ')

            const tasks = require(jobPath)(WORKER)
        
            const tasks$ = _.chain(tasks)
                .zip(args)
                .map(([{jobName, worker$}, args]) =>
                    of({jobName, worker$, args})
                )
                .value()

            const jobArgs$ = args$.pipe(
                filter(arg => arg.requestId === requestId),
                map(({value}) => value)
            )

            const jobCmd$ = cmd$.pipe(
                filter(arg => arg.requestId === requestId),
                map(({cmd}) => cmd)
            )

            const runWorker$ = (worker$, requestTag, initArgs, args, args$, cmd$) =>
                worker$(...args, {requestId, requestTag, initArgs, args$, cmd$})

            const workerLog = (jobName, args) =>
                log.isTrace()
                    ? _.isEmpty(args)
                        ? log.trace(jobMsg(jobName, 'with no args'))
                        : log.trace(jobMsg(jobName, 'with args'), args)
                    : log.debug(() => jobMsg(jobName))

            const result$ = concat(...tasks$).pipe(
                tap(({jobName, args}) => workerLog(jobName, args)),
                mergeMap(({worker$, args}) => runWorker$(worker$, requestTag, initArgs, args, jobArgs$, jobCmd$), 1),
                takeUntil(stop$),
                finalize(() => {
                    log.trace(() => jobMsg(jobName, 'result$ finalized'))
                    stop()
                })
            )
    
            result$.subscribe({
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
                log.trace(() => workerMsg('request$ finalized'))
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
