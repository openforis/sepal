const {Subject, of} = require('rxjs')
const {finalize, first, map, filter, catchError} = require('rxjs/operators')
const {Worker, MessageChannel} = require('worker_threads')
const {v4: uuid} = require('uuid')
const path = require('path')
const _ = require('lodash')
const log = require('sepal/log')('job')
const Transport = require('./transport')
const service = require('sepal/service')

const WORKER_PATH = path.join(__dirname, 'worker.js')

const bootstrapWorker$ = (name, logConfig) => {
    const worker$ = new Subject()
    const worker = new Worker(WORKER_PATH)
    const {port1: localPort, port2: remotePort} = new MessageChannel()
    worker.on('message', message => {
        message.ready && worker$.next({worker, port: localPort})
    })
    worker.postMessage({name, logConfig, port: remotePort}, [remotePort])
    return worker$.pipe(
        first()
    )
}

const setupWorker = ({name, jobPath, worker, port}) => {
    const disposables = []
    const transport = Transport({id: 'main', port})

    transport.onChannel({
        service: ({conversationId: servicePath, in$: response$, out$: request$}) =>
            service.start(servicePath, request$, response$)
    })
 
    const msg = (msg, jobId) => [
        `Job [${name}${jobId ? `.${jobId.substr(-4)}` : ''}]`,
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
            log.debug(msg('complete', jobId))
            sendMessage({stop: true})
            in$.complete()
        }

        args$ && args$.subscribe(
            value => sendMessage({value}),
            // [TODO] handle error
        )

        start()

        return out$.pipe(
            catchError(error => {
                log.error(error.toString())
                return of({jobId, error})
            }),
            filter(message => message.jobId === jobId),
            finalize(() => stop())
        )
    }

    const dispose = () => {
        worker.terminate()
        _.forEach(disposables, disposable => disposable.dispose())
    }

    log.debug('Worker ready')

    return {
        submit$,
        dispose
    }
}

const initWorker$ = (name, jobPath, logConfig) =>
    bootstrapWorker$(name, logConfig).pipe(
        map(({worker, port}) =>
            setupWorker({name, jobPath, worker, port})
        )
    )

module.exports = {initWorker$}
