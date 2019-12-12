const {Subject} = require('rxjs')
const {finalize, first, map, filter} = require('rxjs/operators')
const {Worker, MessageChannel} = require('worker_threads')
const {v4: uuid} = require('uuid')
const path = require('path')
const Transport = require('../comm/transport')
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
    const transport = Transport({id: 'main', port: ports.job})
    
    const {in$: response$, out$: request$} = transport.createChannel('service')
    service.initMain(request$, response$)
     
    const msg = (msg, jobId) => [
        `Worker job [${name}${jobId ? `.${jobId.substr(-4)}` : ''}]`,
        msg
    ].join(' ')

    const submit$ = (args, args$) => {
        const jobId = uuid()
        const {in$, out$} = transport.createChannel('job')
    
        const sendMessage = msg =>
            in$.next({jobId, ...msg})

        const start = () => {
            const workerArgs = _.last(args)
            _.isEmpty(workerArgs)
                ? log.debug(msg('started with no args', jobId))
                : log.debug(msg('started with args:', jobId), workerArgs)
            sendMessage({start: {jobPath, args}})
        }

        const stop = () => {
            sendMessage({stop: true})
            in$.complete()
        }

        args$ && args$.subscribe(
            value => sendMessage({value})
        )

        start()

        return out$.pipe(
            filter(message => message.jobId === jobId),
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
    bootstrapWorker$(name, ['job']).pipe(
        map(({worker, ports}) =>
            setupWorker({name, jobPath, worker, ports})
        )
    )

module.exports = {
    initWorker$
}
