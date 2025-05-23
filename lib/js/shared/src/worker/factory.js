const {Subject, of, finalize, first, filter, catchError, switchMap, concat, NEVER} = require('rxjs')
const {Worker} = require('worker_threads')
const path = require('path')
const _ = require('lodash')
const service = require('#sepal/service')
const {workerTag} = require('./tag')
const {PortTransport} = require('../rxjs/transport/port')
const log = require('#sepal/log').getLogger('factory')
const {getLogConfig} = require('#sepal/log')

const WORKER_PATH = path.join(__dirname, 'worker.js')

const bootstrapWorker$ = ({workerId}) => {
    const worker$ = new Subject()
    const logConfig = getLogConfig()
    const worker = new Worker(WORKER_PATH, {
        workerData: {workerId, logConfig}
    })
    
    const workerMsg = msg =>
        `${workerTag(workerId)} ${msg}`

    worker.on('online', () => {
        log.debug(workerMsg('online'))
    })
    worker.on('error', error => {
        log.error(workerMsg('error'), error)
    })
    worker.on('messageerror', error => {
        log.error(workerMsg('messageerror'), error)
    })
    worker.on('exit', () => {
        log.debug(workerMsg('exit'))
    })
    worker.on('message', message => {
        message.ready && worker$.next(worker)
    })

    return worker$.pipe(first())
}

const setupWorker$ = ({workerId, worker}) => {
    const transportId = workerTag(workerId)
    const transport = PortTransport({
        transportId,
        port: worker,
        onChannel: ({conversationGroupId: serviceName, in$: response$, out$: request$}) => {
            if (serviceName) {
                service.start(serviceName, request$, response$)
            }
        }
    })

    const workerMsg = msg =>
        `${workerTag(workerId)} ${msg}`

    const submit$ = ({jobName, jobPath, requestId, requestTag, initArgs, args, arg$, cmd$, cancel$}) => {
        const {in$: request$, out$: response$} = transport.createChannel('job')

        const start = () => {
            log.debug(workerMsg('start'))
            request$.next({start: {requestId, requestTag, jobName, jobPath, initArgs, args}})
        }

        const stop = () => {
            log.debug(workerMsg('stop'))
            request$.complete()
        }

        arg$ && arg$.subscribe(
            arg => request$.next({next: {requestId, arg}})
        )

        cmd$ && cmd$.subscribe(
            cmd => request$.next({next: {requestId, cmd}})
        )

        cancel$ && cancel$.subscribe(
            () => stop()
        )

        setImmediate(() => start())

        return response$.pipe(
            catchError(error => of({requestId, error: true, value: error})),
            filter(message => message.requestId === requestId),
            finalize(() => stop())
        )
    }

    const dispose = () => {
        log.debug(workerMsg('dispose'))
        worker.terminate()
        transport.dispose()
    }

    return concat(of(submit$), NEVER).pipe(
        finalize(() => dispose())
    )
}

const initWorker$ = ({workerId}) =>
    bootstrapWorker$({workerId}).pipe(
        switchMap(worker => setupWorker$({workerId, worker}))
    )

const WORKER = Symbol()

module.exports = {initWorker$, WORKER}
