const {parentPort} = require('worker_threads')
const {Subject, concat} = require('rxjs')
const {takeUntil} = require('rxjs/operators')
const {serializeError} = require('serialize-error')
const _ = require('lodash')

const log = require('./log')

const exported = {}

parentPort.once('message', ports => {
    const stop$ = new Subject()
    exported.ports = ports
    const jobPort = ports.job

    const next = value =>
        jobPort.postMessage({value})

    const complete = () =>
        jobPort.postMessage({complete: true})

    const error = error =>
        jobPort.postMessage({
            error: serializeError(error)
        })

    const start = ({jobName, jobPath, args}) => {
        const workers = require(jobPath)()
        log.info(`Starting worker: ${jobName}`)

        const jobs$ = _.chain(workers)
            .zip(args)
            .map(([worker$, args]) => worker$(...args))
            .value()
            
        concat(...jobs$).pipe(
            takeUntil(stop$)
        ).subscribe({next, error, complete})
    }

    const stop = () => {
        log.info('Stopping worker')
        stop$.next()
        jobPort.off('message', handleMessage)
    }

    const handleMessage = message => {
        if (message.start) {
            const job = message.start
            start(job)
        }
        if (message.stop) {
            stop()
        }
    }

    jobPort.on('message', handleMessage)
    parentPort.postMessage('READY')
})

module.exports = exported
