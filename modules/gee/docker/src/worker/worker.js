const {parentPort} = require('worker_threads')
const {Subject, concat} = require('rxjs')
const {takeUntil} = require('rxjs/operators')
const {serializeError} = require('serialize-error')
const _ = require('lodash')
const log = require('../log')

const exported = {}

parentPort.once('message', ports => {
    const stop$ = new Subject()
    exported.ports = ports
    const jobPort = ports.job

    const next = value => {
        log.trace(`Worker: next: ${value}`)
        return jobPort.postMessage({value})
    }

    const complete = () => {
        log.trace('Worker: complete')
        return jobPort.postMessage({complete: true})
    }

    const error = error => {
        log.trace(`Worker: error: ${error}`)
        return jobPort.postMessage({error: serializeError(error)})
    }

    const start = ({jobName, jobPath, args}) => {
        const workers = require(jobPath)()
        log.info(`Worker: starting ${jobName}`)

        const jobs$ = _.chain(workers)
            .zip(args)
            .map(([worker$, args]) => worker$(...args))
            .value()
            
        concat(...jobs$).pipe(
            takeUntil(stop$)
        ).subscribe({next, error, complete})
    }

    const stop = () => {
        log.info('Worker: stop')
        stop$.next()
    }

    const dispose = () => {
        log.info('Worker: dispose')
        jobPort.off('message', handleMessage)
    }

    const handleMessage = message => {
        if (message.start) {
            start(message.start)
        }
        if (message.stop) {
            stop()
        }
        if (message.dispose) {
            dispose()
        }
    }

    jobPort.on('message', handleMessage)
    log.trace('Worker: ready')
    parentPort.postMessage('READY')
})

module.exports = exported
