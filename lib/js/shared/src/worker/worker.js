const {parentPort} = require('worker_threads')
const {ReplaySubject, Subject, of, concat} = require('rx')
const {filter, finalize, map, mergeMap, takeUntil, tap} = require('rx/operators')
const {serializeError} = require('serialize-error')
const _ = require('lodash')
const service = require('sepal/service')
const Transport = require('./transport')
const log = require('sepal/log').getLogger('worker')
const {workerTag, taskTag} = require('./tag')
const {toException} = require('sepal/exception')
const {WORKER} = require('./factory')

const exported = {}

const configureLog = config =>
    require('sepal/log').configureClient(config)

const initWorker = ({workerId, jobName, port}) => {
    const args$ = new Subject()
    const cmd$ = new ReplaySubject()
    const stop$ = new Subject()

    const workerMsg = msg =>
        `${workerTag(jobName, workerId)} ${msg}`

    const setupJob = ({request$, response$}) => {
        log.trace(workerMsg('setting up'))
        const start = ({requestTag, jobPath, initArgs, args}) => {

            const jobMsg = (requestTag, taskName, msg) =>
                [
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
                filter(arg => arg.requestTag === requestTag),
                map(({value}) => value)
            )

            const jobCmd$ = cmd$.pipe(
                filter(arg => arg.requestTag === requestTag),
                map(({cmd}) => cmd)
            )

            const runWorker$ = (worker$, initArgs, args, args$, cmd$) =>
                worker$(...args, {requestTag, initArgs, args$, cmd$})

            const workerLog = (jobName, args) =>
                log.isTrace()
                    ? _.isEmpty(args)
                        ? log.trace(() => jobMsg(requestTag, jobName, 'with no args'))
                        : log.trace(() => jobMsg(requestTag, jobName, 'with args'), args)
                    : log.debug(() => jobMsg(requestTag, jobName))

            const jobLog = (jobName, args) =>
                require('sepal/log').getLogger(`job:${jobName}`).debug(requestTag, args)
        
            const result$ = concat(...tasks$).pipe(
                tap(({jobName, args}) => workerLog(jobName, args)),
                tap(({jobName, args}) => jobLog(jobName, args)),
                mergeMap(({worker$, args}) => runWorker$(worker$, initArgs, args, jobArgs$, jobCmd$), 1),
                takeUntil(stop$),
                finalize(() => {
                    log.trace('result$ finalized')
                    stop()
                })
            )
    
            result$.subscribe({
                next: value => response$.next(({requestTag, next: true, value})),
                error: error => response$.next({requestTag, error: true, value: serializeError(toException(error))}),
                complete: () => response$.next({requestTag, complete: true})
            })
        }
        
        const stop = () =>
            stop$.next()
        
        const next = ({requestTag, ...msg}) => {
            msg.value && args$.next({requestTag, value: msg.value})
            msg.cmd && cmd$.next({requestTag, cmd: msg.cmd})
        }

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
