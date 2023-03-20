const {Subject, of, finalize, first, map, filter, catchError} = require('rxjs')
const {Worker, MessageChannel} = require('worker_threads')
const path = require('path')
const _ = require('lodash')
const service = require('#sepal/service')
const {workerTag} = require('./tag')
const {PortTransport} = require('../rxjs/transport/port')
const {registerWorkerMetrics} = require('#sepal/metrics')
const log = require('#sepal/log').getLogger('factory')

const WORKER_PATH = path.join(__dirname, 'worker.js')

const bootstrapWorker$ = ({workerId, jobName, logConfig}) => {
    const worker$ = new Subject()
    const worker = new Worker(WORKER_PATH)
    const {port1: localPort, port2: remotePort} = new MessageChannel()
    
    const workerMsg = msg =>
        `${workerTag(jobName, workerId)} ${msg}`

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
        message.ready && worker$.next({worker, port: localPort})
    })

    worker.postMessage({workerId, jobName, logConfig, port: remotePort}, [remotePort])
    
    return worker$.pipe(
        first()
    )
}

const setupWorker = ({workerId, jobName, jobPath, worker, port}) => {
    const transportId = workerTag(jobName, workerId)
    const transport = PortTransport({
        transportId,
        port,
        onChannel: ({conversationGroupId: serviceName, in$: response$, out$: request$}) => {
            if (serviceName) {
                service.start(serviceName, request$, response$)
            }
        }
    })

    const {metricsRequest$, metricsResponse$, metricsSubscription} = registerWorkerMetrics()
    transport.createChannel('metrics', {in$: metricsRequest$, out$: metricsResponse$})

    const submit$ = ({requestId, initArgs, args, args$, cmd$}) => {
        const {in$: request$, out$: response$} = transport.createChannel('job')

        const start = () =>
            request$.next({start: {requestId, jobPath, initArgs, args}})

        const stop = () =>
            request$.complete()

        args$ && args$.subscribe(
            value => request$.next({next: {requestId, value}})
            // [TODO] handle error
        )

        cmd$ && cmd$.subscribe(
            cmd => request$.next({next: {requestId, cmd}})
        )

        start()

        return response$.pipe(
            catchError(error => of({requestId, error: true, value: error})),
            filter(message => message.requestId === requestId),
            finalize(() => stop())
        )
    }

    const dispose = () => {
        worker.terminate()
        transport.dispose()
        metricsSubscription.unsubscribe()
    }

    return {
        submit$,
        dispose
    }
}

const initWorker$ = ({workerId, jobName, jobPath, logConfig}) =>
    bootstrapWorker$({workerId, jobName, logConfig}).pipe(
        map(({worker, port}) =>
            setupWorker({workerId, jobName, jobPath, worker, port})
        )
    )

const WORKER = Symbol()

module.exports = {initWorker$, WORKER}
