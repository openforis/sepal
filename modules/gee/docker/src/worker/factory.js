const {Subject} = require('rxjs')
const {finalize, first, map, filter} = require('rxjs/operators')
const {Worker, MessageChannel} = require('worker_threads')
const {deserializeError} = require('serialize-error')
const {v4: uuid} = require('uuid')
const path = require('path')
const service = require('@sepal/worker/service')
const _ = require('lodash')
const log = require('@sepal/log')

const WORKER_PATH = path.join(__dirname, 'worker.js')

const createMessageChannels = names =>
    _.transform(names, (data, name) => {
        const {port1: localPort, port2: remotePort} = new MessageChannel()
        data.localPorts[name] = localPort
        data.remotePorts[name] = remotePort
    }, {
        localPorts: {},
        remotePorts: {}
    })

const bootstrapWorker$ = (name, channelNames) => {
    const worker$ = new Subject()
    const worker = new Worker(WORKER_PATH)
    const {localPorts, remotePorts} = createMessageChannels(channelNames)
    worker.once('message', status => {
        if (status === 'READY') {
            worker$.next({worker, ports: localPorts})
        } else {
            worker$.error('Cannot initialize worker.')
        }
    })
    worker.postMessage({name, ports: remotePorts}, _.values(remotePorts))
    return worker$.pipe(
        first()
    )
}

const setupWorker = ({name, jobPath, worker, ports}) => {
    const workerResult$ = new Subject()

    const msg = (msg, jobId) => [
        `Worker job [${name}${jobId ? `.${jobId.substr(-4)}` : ''}]`,
        msg
    ].join(' ')

    // translate upstream worker messages to workerResult$ stream

    const handleUpstreamWorkerMessage = message => {
        const handleValue = ({jobId, value}) => {
            log.trace(msg(`value: ${value}`, jobId))
            workerResult$.next({jobId, value})
        }
    
        const handleError = ({jobId, error: serializedError}) => {
            const error = deserializeError(serializedError)
            const errors = _.compact([
                error.message,
                error.type ? `(${error.type})` : null
            ]).join()
            log.error(msg(`error: ${errors}`, jobId))
            workerResult$.next({jobId, error})
        }
    
        const handleComplete = ({jobId, complete}) => {
            log.debug(msg('completed', jobId))
            workerResult$.next({jobId, complete})
        }

        message.value && handleValue(message)
        message.error && handleError(message)
        message.complete && handleComplete(message)
    }

    ports.job.on('message', handleUpstreamWorkerMessage)

    // handle service messages

    service.initMain(ports.service)

    const getJobResult$ = jobId => {
        const jobResult$ = new Subject()
        workerResult$.pipe(
            filter(message => message.jobId === jobId)
        ).subscribe(
            message => {
                message.value && jobResult$.next({value: message.value})
                message.error && jobResult$.error({error: message.error})
                message.complete && jobResult$.complete()
            },
            error => log.error(error), // how to handle this?
            complete => log.warn(complete) // how to handle this?
        )
        return jobResult$
    }

    const submit$ = (args, args$) => {
        const jobId = uuid()

        const sendMessage = msg =>
            ports.job.postMessage({jobId, ...msg})

        const start = () => {
            const workerArgs = _.last(args)
            _.isEmpty(workerArgs)
                ? log.debug(msg('started with no args', jobId))
                : log.debug(msg('started with args:', jobId), workerArgs)
            sendMessage({start: {jobPath, args}})
        }

        const stop = () =>
            sendMessage({stop: true})

        args$ && args$.subscribe(
            value => sendMessage({value})
        )

        start()

        return getJobResult$(jobId).pipe(
            finalize(() => stop())
        )
    }

    const dispose = () =>
        worker.terminate()

    log.trace('Worker ready')

    return {
        submit$,
        dispose
    }
}

const initWorker$ = (name, jobPath) =>
    bootstrapWorker$(name, ['job', 'service']).pipe(
        map(({worker, ports}) =>
            setupWorker({name, jobPath, worker, ports})
        )
    )

module.exports = {
    initWorker$
}
