const {Subject, of} = require('rxjs')
const {finalize, first, map, filter, catchError} = require('rxjs/operators')
const {Worker, MessageChannel} = require('worker_threads')
const path = require('path')
const _ = require('lodash')
const Transport = require('./transport')
const service = require('sepal/service')
const {workerTag} = require('./tag')

const WORKER_PATH = path.join(__dirname, 'worker.js')

const bootstrapWorker$ = ({workerId, jobName, logConfig}) => {
    const worker$ = new Subject()
    const worker = new Worker(WORKER_PATH)
    const {port1: localPort, port2: remotePort} = new MessageChannel()
    worker.on('message', message => {
        message.ready && worker$.next({worker, port: localPort})
    })
    worker.postMessage({workerId, jobName, logConfig, port: remotePort}, [remotePort])
    return worker$.pipe(
        first()
    )
}

const setupWorker = ({workerId, jobName, jobPath, worker, port}) => {
    const disposables = []
    const transport = Transport({id: 'main', port})
    const id = workerTag(jobName, workerId)

    transport.onChannel({
        [`${id}.service`]: ({conversationId: servicePath, in$: response$, out$: request$}) =>
            service.start(servicePath, request$, response$)
    })
 
    const submit$ = (jobId, args, args$) => {
        const {in$: request$, out$: response$} = transport.createChannel(id, 'job')

        const start = () =>
            request$.next({start: {jobId, jobPath, args}})

        const stop = () => {
            request$.next({stop: {jobId}})
            request$.complete()
        }

        args$ && args$.subscribe(
            value => request$.next({next: {jobId, value}}),
            // [TODO] handle error
        )

        start()

        return response$.pipe(
            catchError(error => of({jobId, error: true, value: error})),
            filter(message => message.jobId === jobId),
            finalize(() => stop())
        )
    }

    const dispose = () => {
        worker.terminate()
        _.forEach(disposables, disposable => disposable.dispose())
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
