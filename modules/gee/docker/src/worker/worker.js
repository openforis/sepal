require('module-alias/register')
const {parentPort} = require('worker_threads')
const {Subject, of, concat} = require('rxjs')
const {map, mergeMap, takeUntil, tap, filter} = require('rxjs/operators')
const _ = require('lodash')
const {streamToPort} = require('./communication')
const service = require('./service')
const log = require('@sepal/log')

const exported = {}

const initWorker = (port, name) => {
    const args$ = new Subject()
    const stop$ = new Subject()

    const msg = (msg, jobId) => [
        `Worker [${name}${jobId ? `.${jobId.substr(-4)}` : ''}]`,
        msg
    ].join(' ')
    
    const start = ({jobId, start: {jobPath, args}}) => {
        log.trace(msg('start', jobId))
        const tasks = require(jobPath)()
    
        const tasks$ = _.chain(tasks)
            .zip(args)
            .map(([{jobName, worker$}, args]) =>
                of({jobName, worker$, args})
            )
            .value()
    
        const jobArgs$ = args$.pipe(
            filter(arg => arg.jobId === jobId),
            map(({value}) => value)
        )
    
        run(jobId, tasks$, jobArgs$)
    }
    
    const run = (jobId, tasks$, args$) => {
        const jobResult$ = concat(...tasks$).pipe(
            tap(({jobName, args}) =>
                log.trace(msg(`running <${jobName}> with args:`, jobId), args)
            ),
            mergeMap(({worker$, args}) => worker$(...args, args$), 1),
            takeUntil(stop$.pipe(filter(id => id === jobId)))
        )
    
        streamToPort({
            jobId,
            stream$: jobResult$,
            port
        })
    }
    
    const stop = ({jobId}) => {
        log.trace(msg('stop', jobId))
        stop$.next(jobId)
    }
    
    const next = ({jobId, value}) => {
        args$.next({jobId, value})
    }
    
    const handleJobMessage = message => {
        message.start && start(message)
        message.stop && stop(message)
        message.value && next(message)
    }
    
    port.on('message', handleJobMessage)
}

parentPort.once('message', ({name, ports}) => {
    exported.ports = ports
    initWorker(ports.job, name)
    service.initWorker(ports.service)
    parentPort.postMessage('READY')
})

module.exports = exported
