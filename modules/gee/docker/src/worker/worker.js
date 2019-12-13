require('module-alias/register')
const {parentPort} = require('worker_threads')
const {Subject, of, concat} = require('rxjs')
const {map, mergeMap, takeUntil, tap, filter} = require('rxjs/operators')
const _ = require('lodash')
const service = require('./service')
const Transport = require('../comm/transport')
const log = require('@sepal/log')

const exported = {}

const initWorker = (port, name) => {
    const args$ = new Subject()
    const stop$ = new Subject()

    const msg = (msg, jobId) => [
        `Worker [${name}${jobId ? `.${jobId.substr(-4)}` : ''}]`,
        msg
    ].join(' ')

    const setupJob = (in$, out$) => {
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
        
            const result$ = concat(...tasks$).pipe(
                tap(({jobName, args}) =>
                    log.trace(msg(`running <${jobName}> with args:`, jobId), args)
                ),
                mergeMap(({worker$, args}) => worker$(...args, jobArgs$), 1),
                map(value => ({jobId, value})),
                takeUntil(stop$.pipe(filter(id => id === jobId)))
            )
    
            result$.subscribe({
                next: value => in$.next(value),
                error: error => in$.error(error),
                complete: () => in$.complete()
            })
        }
        
        const stop = ({jobId}) => {
            log.trace(msg('stop', jobId))
            stop$.next(jobId)
        }
        
        const next = ({jobId, value}) => {
            args$.next({jobId, value})
        }
        
        out$.subscribe(
            message => {
                message.start && start(message)
                message.stop && stop(message)
                message.value && next(message)
            }
        )
    }

    const transport = Transport({id: 'worker', port})
    
    transport.onChannel({
        job: ({in$, out$}) => setupJob(in$, out$)
    })

    service.initWorker(transport)
}

parentPort.once('message', ({name, ports}) => {
    exported.ports = ports
    initWorker(ports.job, name)
    parentPort.postMessage('READY')
})

module.exports = exported
