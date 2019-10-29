const {parentPort} = require('worker_threads')
const {Subject, concat} = require('rxjs')
const {takeUntil} = require('rxjs/operators')
const _ = require('lodash')

const log = require('./log')

const exported = {}

parentPort.once('message', ports => {
    const stop$ = new Subject()
    exported.ports = ports
    const jobPort = ports.job

    const start = ({jobName, jobPath, args}) => {
        const workers = require(jobPath)()
        log.info(`Starting worker: ${jobName}`)

        const jobs = _.chain(workers)
            .zip(args)
            .map(([worker$, args]) => worker$(...args))
            .value()
            
        const job$ = concat(...jobs)
        job$.pipe(
            takeUntil(stop$)
        ).subscribe(
            value => jobPort.postMessage({value}),
            error => jobPort.postMessage({error}),
            () => jobPort.postMessage({complete: true})
        )
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
