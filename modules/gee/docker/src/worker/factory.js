const {Subject} = require('rxjs')
const {finalize, first, map, filter} = require('rxjs/operators')
const {Worker, MessageChannel} = require('worker_threads')
const {deserializeError} = require('serialize-error')
const {v4: uuid} = require('uuid')
const path = require('path')
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

const initWorker$ = (name, jobPath) => {
    const msg = (msg, jobId) => [
        `[${name}${jobId ? `.${jobId.substr(-4)}` : ''}]`,
        msg
    ].join(' ')
    
    const result$ = new Subject()

    const handleWorkerMessage = message => {
        message.value && handleValue(message)
        message.error && handleError(message)
        message.complete && handleComplete(message)
    }

    const handleValue = ({jobId, value}) => {
        log.trace(msg(`value: ${value}`, jobId))
        result$.next({jobId, value})
    }

    const handleError = ({jobId, error: serializedError}) => {
        const error = deserializeError(serializedError)
        const errors = _.compact([
            error.message,
            error.type ? `(${error.type})` : null
        ]).join()
        log.error(msg(`error: ${errors}`, jobId))
        result$.next({jobId, error})
    }

    const handleComplete = ({jobId, complete}) => {
        log.debug(msg('completed', jobId))
        result$.next({jobId, complete})
    }

    const setupWorker = (worker, port) => {
        const openPort = () => port.on('message', handleWorkerMessage)
        const closePort = () => port.off('message', handleWorkerMessage)
        const send = msg => port.postMessage(msg)

        openPort()
        log.trace('Worker ready')

        return {
            submit$(args) {
                const jobId = uuid()
                const jobResult$ = new Subject()
    
                result$.pipe(
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
    
                const start = jobId => {
                    const workerArgs = _.last(args)
                    _.isEmpty(workerArgs)
                        ? log.debug(msg('started with no args', jobId))
                        : log.debug(msg('started with args:', jobId), workerArgs)
                    send({jobId, start: {jobPath, args}})
                }
    
                const stop = jobId =>
                    send({jobId, stop: true})
    
                start(jobId)
                return {
                    down$: jobResult$.pipe(
                        finalize(() => stop(jobId))
                    )
                }
            },
            dispose() {
                closePort()
                worker.unref() // is this correct? terminate() probably isn't...
                log.info(msg('disposed'))
            }
        }
    }

    return bootstrapWorker$(name, ['job']).pipe(
        map(({worker, ports: {job: port}}) => setupWorker(worker, port))
    )
}

module.exports = {
    initWorker$
}
