const {parentPort} = require('worker_threads')
const {Subject, of, concat} = require('rxjs')
const {catchError, map, mergeMap, takeUntil, tap, filter} = require('rxjs/operators')
const {serializeError} = require('serialize-error')
const {SystemException, isException} = require('sepal/exception')
const {EEException} = require('sepal/ee/exception')
const _ = require('lodash')
const service = require('sepal/service')
const Transport = require('./transport')
const log = require('sepal/log').getLogger('worker')
const {jobTag, workerTag, taskTag} = require('./tag')

const exported = {}

const configureLog = config =>
    require('sepal/log').configureClient(config)

const initWorker = ({workerId, jobName, port}) => {
    const args$ = new Subject()
    const stop$ = new Subject()

    const workerMsg = msg => [
        `worker [${workerTag(jobName, workerId)}]`,
        msg
    ].join(' ')

    const formatError = error =>
        isException(error)
            ? error
            : _.isString(error)
                ? new EEException({
                    error,
                    userMessage: {
                        message: `Earth Engine: ${error}`,
                        key: 'gee.error.earthEngineException',
                        args: {earthEngineMessage: error}
                    }
                })
                : new SystemException({
                    error,
                    userMessage: {
                        message: 'Internal error',
                        key: 'error.internal'
                    }
                })
        
    const setupJob = (response$, request$) => {
        const start = ({jobId, start: {jobPath, args}}) => {
            log.trace(workerMsg('starting'))

            const jobMsg = (jobId, taskName, msg) =>
                workerMsg([
                    'running',
                    `job [${jobTag(jobName, jobId)}]`,
                    `task [${taskTag(taskName)}]`,
                    msg
                ].join(' '))
        
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
                tap(({jobName, args}) => {
                    log.debug(jobMsg(jobId, jobName))
                    log.trace(jobMsg(jobId, jobName, 'with args:'), args)
                }),
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
            log.trace(workerMsg('stopping'))
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
            error => log.fatal(workerMsg('request stream failed:'), error),
            // error => log.fatal(`Worker [${workerId}] request stream failed:`, error),
            // stream is allowed to complete
        )
    }

    const id = workerTag(jobName, workerId)

    const transport = Transport({id: 'worker', port})

    transport.onChannel({
        [id]: ({in$, out$}) => setupJob(in$, out$),
    })

    service.initialize({transport, id})

    log.debug(workerMsg('initialized'))
}

const ready = () =>
    parentPort.postMessage({ready: true})

parentPort.once('message', ({workerId, jobName, logConfig, port}) => {
    exported.port = port
    configureLog(logConfig)
    initWorker({workerId, jobName, port})
    ready()
})

module.exports = exported
