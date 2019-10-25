const {Worker, MessageChannel} = require('worker_threads')
const {Subject} = require('rxjs')
const {finalize, switchMap} = require('rxjs/operators')
const path = require('path')
const _ = require('lodash')
const log = require('./log')

const rateLimiter = require('./job/rateLimiter')

const WORKER_PATH = path.join(__dirname, 'worker.js')

const createPorts = names =>
    _.transform(names, (data, name) => {
        const {port1: localPort, port2: remotePort} = new MessageChannel()
        data.localPorts[name] = localPort
        data.remotePorts[name] = remotePort
    }, {
        localPorts: {},
        remotePorts: {}
    })

const setupPorts = ({worker, ports}) =>
    new Promise((resolve, reject) => {
        worker
            .once('message', status => {
                if (status === 'READY') {
                    resolve({worker, ports: ports.localPorts})
                } else {
                    reject('Worker not ready.')
                }
            })
            .postMessage(ports.remotePorts, _.values(ports.remotePorts))
    })

const setupWorker = portNames =>
    setupPorts({
        worker: new Worker(WORKER_PATH),
        ports: createPorts(portNames)
    })

const startWorker = ({jobName, jobPath}, args) => {
    const observable$ = new Subject()
    const job$ = new Subject()
    const result$ = job$.pipe(
        switchMap(job => observable$.pipe(
            finalize(() => job.postMessage({stop: true}))
        ))
    )
    setupWorker(['job', 'rateLimit'])
        .then(
            ({worker, ports: {job, rateLimit}}) => {
                job$.next(job)
                const subscription = rateLimiter(rateLimit)
                const handleMessage = message => {
                    if (message.value) {
                        log.trace(`Worker sent value: ${message.value}`)
                        observable$.next(message.value)
                    }
                    if (message.error) {
                        log.error(`Worker sent error: ${message.error}`)
                        observable$.error(message.error)
                    }
                    if (message.complete) {
                        log.info('Worker completed')
                        observable$.complete() // WHY BOTH?
                        result$.complete() // WHY BOTH?
                    }
                    if (message.error || message.complete) {
                        worker.unref() // is this correct? terminate() probably isn't...
                        subscription.cleanup()
                        job.off('message', handleMessage)
                    }
                }
                job.on('message', handleMessage)
                job.postMessage({start: {jobName, jobPath, args}})
            }
        )
    return result$
}

const submit = ({jobName, jobPath, before, ctx}) => {
    const beforeArgs = before
        ? before.map((m => m(ctx)))
        : []
    return {
        submit: (...args) => startWorker({jobName, jobPath}, [...beforeArgs, args])
    }
}

const worker = ({before, worker$}) => {
    const beforeWorker$ = before
        ? before.map((m => m()))
        : []
    return [...beforeWorker$, worker$]
}

module.exports = ({jobName, jobPath, before, worker$}) =>
    ctx => ctx
        ? submit({jobName, jobPath, before, ctx})
        : worker({before, worker$})
