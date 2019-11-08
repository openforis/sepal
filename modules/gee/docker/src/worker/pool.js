const {Worker, MessageChannel} = require('worker_threads')
const {Subject, ReplaySubject, of, defer} = require('rxjs')
const {finalize, takeUntil, switchMap, first, groupBy, mergeMap} = require('rxjs/operators')
const {deserializeError} = require('serialize-error')
const {v4: uuid} = require('uuid')
const path = require('path')
const _ = require('lodash')
const log = require('../log')

const rateLimiter = require('../job/rateLimiter')

const WORKER_PATH = path.join(__dirname, 'worker.js')

const workerPool = {}

const workerRequest$ = new Subject()

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
    
const bootstrapWorker = (jobName, channelNames) =>
    new Promise((resolve, reject) => {
        const worker = createWorker(jobName)
        const channels = createChannels(channelNames)
        worker
            .once('message', status => {
                if (status === 'READY') {
                    resolve({worker, ports: channels.localPorts})
                } else {
                    reject('Cannot initialize worker.')
                }
            })
            .postMessage(channels.remotePorts, _.values(channels.remotePorts))
    })

const startWorker = (jobName, jobPath) => {
    const init$ = new ReplaySubject()
    const dispose$ = new Subject()
    const id = uuid()

    // bootstrapWorker(jobName, ['job', 'rateLimit'])
    bootstrapWorker(jobName, ['job'])
        .then(
            ({worker, ports: {job: jobPort, rateLimitPort}}) => {
                init$.next(jobPort)
                // const subscription = rateLimiter(rateLimitPort)
                // jobPort.on('message', handleWorkerMessage)

                dispose$.pipe(
                    first()
                ).subscribe(
                    () => {
                        worker.unref() // is this correct? terminate() probably isn't...
                        // subscription.cleanup()
                        log.info(`Job: worker <${jobName}> disposed.`)
                    }
                )
                log.info('Job: worker ready')
            }
        )

    return {
        id,
        submit$: args => {
            const result$ = new Subject()
            const stop$ = new Subject()

            const handleValue = value => {
                log.trace(`Job: worker <${jobName}> value: ${value}`)
                result$.next(value)
            }
        
            const handleError = serializedError => {
                const error = deserializeError(serializedError)
                log.error(`Job: worker <${jobName}> error: ${error.message} (${error.type})`)
                result$.error(error)
                stop$.next()
            }
        
            const handleComplete = () => {
                log.info(`Job: worker <${jobName}> completed`)
                result$.complete()
                stop$.next()
            }
        
            const handleWorkerMessage = message => {
                message.value && handleValue(message.value)
                message.error && handleError(message.error)
                message.complete && handleComplete()
            }

            const start = port => {
                port.on('message', handleWorkerMessage)
                port.postMessage({start: {jobName, jobPath, args}})
            }

            const stop = port => {
                port.postMessage({stop: true})
                port.off('message', handleWorkerMessage)
                releaseWorkerInstance(jobName, id)
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
        },
        dispose: () => {
            dispose$.next()
        }
    }
}

const releaseWorkerInstance = (jobName, id) => {
    const workerInstance = _.find(workerPool[jobName], workerInstance => workerInstance.worker.id === id)
    if (workerInstance) {
        workerInstance.locked = false
    }
}

const startNewWorkerInstance = (jobName, jobPath) => {
    const worker = startWorker(jobName, jobPath)
    const workerInstance = {
        worker,
        locked: true
    }
    workerPool[jobName] = [...(workerPool[jobName] || []), workerInstance]
    log.trace(`Job: using cold worker <${jobName}.${workerInstance.worker.id}>`)
    return workerInstance
}

const getWorkerInstanceFromPool = jobName => {
    const workerInstance = _.find(workerPool[jobName], workerInstance => !workerInstance.locked)
    if (workerInstance) {
        workerInstance.locked = true
        log.trace(`Job: using hot worker <${jobName}.${workerInstance.worker.id}>`)
    }
    return workerInstance
}

const getOrCreateWorkerInstance = (jobName, jobPath) =>
    getWorkerInstanceFromPool(jobName) || startNewWorkerInstance(jobName, jobPath)
    // startNewWorkerInstance(jobName, jobPath)

const getWorker$ = (jobName, jobPath) => {
    const worker$ = new ReplaySubject()
    workerRequest$.next({worker$, jobName, jobPath})
    return worker$.pipe(
        first()
    )
}

workerRequest$.pipe(
    groupBy(({jobName}) => jobName),
    mergeMap(group =>
        group.pipe(
            mergeMap(({worker$, jobName, jobPath}) =>
                defer(() =>
                    of({
                        worker$,
                        worker: getOrCreateWorkerInstance(jobName, jobPath).worker
                    })
                )
            )
        ), null, 1
    )
).subscribe(
    ({worker$, worker}) => worker$.next(worker)
)

module.exports = {
    getWorker$
}
