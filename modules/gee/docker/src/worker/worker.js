require('module-alias/register')
const {parentPort} = require('worker_threads')
const {Subject, concat, defer} = require('rxjs')
const {takeUntil} = require('rxjs/operators')
const {serializeError} = require('serialize-error')
const _ = require('lodash')
const log = require('@sepal/log')

const exported = {}

parentPort.once('message', ports => {
    const stop$ = new Subject()
    const jobPort = ports.job
    exported.ports = ports

    const next = value => {
        log.trace(`Worker: value: ${value}`)
        return jobPort.postMessage({value})
    }

    const error = error => {
        log.trace(`Worker: error: ${error}`)
        return jobPort.postMessage({error: serializeError(error)})
    }

    const complete = () => {
        log.trace('Worker: complete')
        return jobPort.postMessage({complete: true})
    }

    const start = ({jobName, jobPath, args}) => {
        const workers = require(jobPath)()
        log.info(`Worker: starting job ${jobName}`)

        const jobs$ = _.chain(workers)
            .zip(args)
            .map(([worker$, args]) => defer(() => worker$(...args)))
            .value()
        concat(...jobs$).pipe(
            takeUntil(stop$)
        ).subscribe({next, error, complete})
    }

    const stop = () => {
        log.info('Worker: stopping job')
        stop$.next()
    }

    const handleMessage = message => {
        message.start && start(message.start)
        message.stop && stop()
        message.dispose && dispose()
    }

    const init = () => {
        log.trace('Worker: ready')
        jobPort.on('message', handleMessage)
        parentPort.postMessage('READY')
    }

    const dispose = () => {
        log.info('Worker: dispose')
        jobPort.off('message', handleMessage)
    }

    init()
})

module.exports = exported
