const {Subject} = require('rxjs')
const {finalize, first, map} = require('rxjs/operators')
const {Worker, MessageChannel} = require('worker_threads')
const {deserializeError} = require('serialize-error')
const {v4: uuid} = require('uuid')
const path = require('path')
const _ = require('lodash')
const log = require('@sepal/log')

const WORKER_PATH = path.join(__dirname, 'worker.js')

const createWorker = () =>
    new Worker(WORKER_PATH)

const createChannels = names =>
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
    const worker = createWorker()
    const {localPorts, remotePorts} = createChannels(channelNames)
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

const initWorker$ = (name, jobPath) => {
    const msg = (msg, jobId) => [
        `[${name}${jobId ? `.${jobId.substr(-4)}` : ''}]`,
        msg
    ].join(' ')
    
    const submit$ = port =>
        args => {
            const jobId = uuid()
            const result$ = new Subject()

            const open = () =>
                port.on('message', handleWorkerMessage)

            const send = msg =>
                port.postMessage(msg)

            const close = () =>
                port.off('message', handleWorkerMessage)

            const handleWorkerMessage = message =>
                message.jobId === jobId
                    ? handleValidWorkerMessage(message)
                    : handleInvalidWorkerMessage(message)
    
            const handleValidWorkerMessage = message => {
                message.value && handleValue(message.value)
                message.error && handleError(message.error)
                message.complete && handleComplete(message.complete)
            }
        
            const handleInvalidWorkerMessage = message =>
                log.trace(msg(`sent msg with non-matching jobId ${message.jobId.substr(-4)}:`, jobId), message)

            const handleValue = value => {
                log.trace(msg(`value: ${value}`, jobId))
                result$.next({value})
            }

            const handleError = serializedError => {
                const error = deserializeError(serializedError)
                const errors = _.compact([
                    error.message,
                    error.type ? `(${error.type})` : null
                ]).join()
                log.error(msg(`error: ${errors}`, jobId))
                result$.next({error})
                close()
            }

            const handleComplete = () => {
                log.debug(msg('completed', jobId))
                result$.complete()
                close()
            }

            const start = jobId => {
                const workerArgs = _.last(args)
                _.isEmpty(workerArgs)
                    ? log.debug(msg('started with no args', jobId))
                    : log.debug(msg('started with args:', jobId), workerArgs)
                open()
                send({start: {jobId, jobPath, args}})
            }

            const stop = jobId =>
                send({stop: {jobId}})

            start(jobId)
            return result$.pipe(
                finalize(() => stop(jobId))
            )
        }

    const dispose = worker => {
        worker.unref() // is this correct? terminate() probably isn't...
        log.info(msg('disposed'))
    }

    const dispose$ = worker => {
        const dispose$ = new Subject()
        dispose$.pipe(
            first()
        ).subscribe(
            () => dispose(worker)
        )
        return dispose$
    }

    return bootstrapWorker$(name, ['job']).pipe(
        map(({worker, ports: {job: jobPort}}) => {
            log.trace('Worker ready')
            return {
                submit$: submit$(jobPort),
                dispose$: dispose$(worker)
            }
        }))
}

module.exports = {
    initWorker$
}
