const {Worker, MessageChannel} = require('worker_threads')
const {Subject, ReplaySubject} = require('rxjs')
const {finalize, takeUntil, switchMap, first} = require('rxjs/operators')
const {deserializeError} = require('serialize-error')
const {v4: uuid} = require('uuid')
const path = require('path')
const _ = require('lodash')
const log = require('../log')

const rateLimiter = require('../job/rateLimiter')

const WORKER_PATH = path.join(__dirname, 'worker.js')

const workerPool = {}

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
            const stop$ = new Subject()
            const result$ = new Subject()

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
                if (message.value) {
                    handleValue(message.value)
                } else {
                    if (message.error) {
                        handleError(message.error)
                    }
                    if (message.complete) {
                        handleComplete()
                    }
                }
            }

            return init$.pipe(
                switchMap(jobPort => {
                    jobPort.on('message', handleWorkerMessage)
                    jobPort.postMessage({start: {jobName, jobPath, args}})
                    return result$.pipe(
                        finalize(() => {
                            jobPort.postMessage({stop: true})
                            jobPort.off('message', handleWorkerMessage)
                            releaseWorkerInstance(jobName, id)
                        })
                    )
                }),
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
    workerInstance.locked = false
}

module.exports = {
    startWorker
}
