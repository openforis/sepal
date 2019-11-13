require('module-alias/register')
const {parentPort} = require('worker_threads')
const {Subject, concat, defer} = require('rxjs')
const {takeUntil} = require('rxjs/operators')
const {serializeError} = require('serialize-error')
const _ = require('lodash')
const log = require('@sepal/log')

const exported = {}

parentPort.once('message', ({name, ports}) => {
    const stop$ = new Subject()
    const jobPort = ports.job
    exported.ports = ports

    const workerMessage = msg =>
        `[Worker <${name}>] ${msg}`

    const next = value => {
        log.trace(workerMessage(`emitted value: ${value}`))
        return jobPort.postMessage({value})
    }

    const error = error => {
        log.trace(workerMessage(`error: ${error}`))
        return jobPort.postMessage({error: serializeError(error)})
    }

    const complete = () => {
        log.trace(workerMessage('complete'))
        return jobPort.postMessage({complete: true})
    }

    const start = ({jobPath, args}) => {
        const workers = require(jobPath)()
        log.trace(workerMessage('starting job'))

        const jobs$ = _.chain(workers)
            .zip(args)
            .map(([worker$, args]) => defer(() => worker$(...args)))
            .value()

        concat(...jobs$).pipe(
            takeUntil(stop$)
        ).subscribe({next, error, complete})
    }

    const stop = () => {
        log.trace(workerMessage('stopping job'))
        stop$.next()
    }

    const handleMessage = message => {
        message.start && start(message.start)
        message.stop && stop()
        message.dispose && dispose()
    }

    const init = () => {
        log.trace(workerMessage('ready'))
        jobPort.on('message', handleMessage)
        parentPort.postMessage('READY')
    }

    const dispose = () => {
        log.debug(workerMessage('dispose'))
        jobPort.off('message', handleMessage)
    }

    init()
})

module.exports = exported
