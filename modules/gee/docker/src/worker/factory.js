const {Subject, ReplaySubject} = require('rxjs')
const {finalize, takeUntil, switchMap, first, map} = require('rxjs/operators')
const {Worker, MessageChannel} = require('worker_threads')
const {deserializeError} = require('serialize-error')
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
    const init$ = new ReplaySubject()
    const dispose$ = new Subject()

    const msg = msg =>
        `Worker <${name}> ${msg}`

    const submit$ = args => {
        const result$ = new Subject()
        const stop$ = new Subject()

        const handleValue = value => {
            log.trace(msg(`emitted value: ${value}`))
            // result$.next(value)
            result$.next({value})
        }

        const handleError = serializedError => {
            const error = deserializeError(serializedError)
            const errors = _.compact([
                error.message,
                error.type ? `(${error.type})` : null
            ]).join()
            log.error(msg(`error: ${errors}`))
            // result$.error(error)
            result$.next({error})
            stop$.next()
        }

        const handleComplete = () => {
            log.debug(msg('completed'))
            result$.complete()
            stop$.next()
        }

        const handleWorkerMessage = message => {
            message.value && handleValue(message.value)
            message.error && handleError(message.error)
            message.complete && handleComplete()
        }

        const start = port => {
            const workerArgs = _.last(args)
            workerArgs
                ? log.debug(msg('running with args:'), workerArgs)
                : log.debug(msg('running with no args'))
            port.on('message', handleWorkerMessage)
            port.postMessage({start: {jobPath, args}})
        }

        const stop = port => {
            port.postMessage({stop: true})
            port.off('message', handleWorkerMessage)
        }

        const run$ = port => {
            start(port)
            return result$.pipe(
                finalize(() => stop(port))
            )
        }

        return init$.pipe(
            switchMap(port => run$(port)),
            takeUntil(stop$)
        )
    }

    // bootstrapWorker$(jobName, ['job', 'rateLimit'])
    return bootstrapWorker$(name, ['job']).pipe(
        map(
            // ({worker, ports: {job: jobPort, rateLimitPort}}) => {
            ({worker, ports: {job: jobPort}}) => {
                init$.next(jobPort)
                // const subscription = rateLimiter(rateLimitPort)
                // jobPort.on('message', handleWorkerMessage)

                dispose$.pipe(
                    first()
                ).subscribe(
                    () => {
                        worker.unref() // is this correct? terminate() probably isn't...
                        // subscription.cleanup()
                        log.info(msg('disposed'))
                    }
                )
                log.trace('Worker ready')

                return {submit$, dispose$}
            }
        ))
}

module.exports = {
    initWorker$
}
