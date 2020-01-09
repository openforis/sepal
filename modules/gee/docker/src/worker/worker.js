require('sepalLog/configure')(require('../log4js.json'))

const {parentPort} = require('worker_threads')
const {Subject, of, concat} = require('rxjs')
const {catchError, map, mergeMap, takeUntil, tap, filter} = require('rxjs/operators')
const {serializeError} = require('serialize-error')
const {Exception, SystemException, isException} = require('root/exception')
const _ = require('lodash')
const service = require('../service')
const Transport = require('./transport')
const log = require('sepalLog')('worker')

const exported = {}

const initWorker = (port, name) => {
    const args$ = new Subject()
    const stop$ = new Subject()

    const msg = (msg, jobId) => [
        `Job [${name}${jobId ? `.${jobId.substr(-4)}` : ''}]`,
        msg
    ].join(' ')

    const formatError = error =>
        isException(error)
            ? error
            : _.isString(error)
                ? new Exception(error, `EE: ${error}`, 'gee.error.earthEngineException', {earthEngineMessage: error})
                : new SystemException(error, 'Internal error', 'error.internal')
        
    const setupJob = (response$, request$) => {
        const start = ({jobId, start: {jobPath, args}}) => {
            log.debug(msg('start', jobId))

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
                    log.debug(msg(`running task <${jobName}> with args:`, jobId), args)
                ),
                mergeMap(({worker$, args}) => worker$(...args, jobArgs$), 1),
                map(value => ({jobId, value})),
                catchError(error => of({jobId, error: serializeError(formatError(error))})),
                takeUntil(stop$.pipe(filter(id => id === jobId)))
            )
    
            result$.subscribe({
                next: value => response$.next(value),
                error: error => response$.error(error),
                complete: () => response$.complete()
            })
        }
        
        const stop = ({jobId}) => {
            log.debug(msg('stop', jobId))
            stop$.next(jobId)
        }
        
        const next = ({jobId, value}) => {
            args$.next({jobId, value})
        }

        request$.subscribe(
            message => {
                message.start && start(message)
                message.stop && stop(message)
                message.value && next(message)
            },
            error => log.fatal(`Worker [${name}] request stream failed:`, error),
            // stream is allowed to complete
        )
    }

    const transport = Transport({id: 'worker', port})
    
    transport.onChannel({
        job: ({in$, out$}) => setupJob(in$, out$)
    })

    service.setTransport(transport)
}

parentPort.once('message', ({name, port}) => {
    exported.port = port
    initWorker(port, name)
    parentPort.postMessage('READY')
})

module.exports = exported
