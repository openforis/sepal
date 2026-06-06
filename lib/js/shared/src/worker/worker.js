import {createRequire} from 'module'
import {concat, concatMap, filter, finalize, map, of, share, Subject, takeUntil, tap} from 'rxjs'
import {serializeError} from 'serialize-error'
import {parentPort, workerData} from 'worker_threads'

import {toException} from '#sepal/exception'
import {configureClient, getLogger} from '#sepal/log'
import * as service from '#sepal/service'

import {PortTransport} from '../rxjs/transport/port.js'
import {WORKER} from './factory.js'
import {taskTag, workerTag} from './tag.js'

const require = createRequire(import.meta.url)
const log = getLogger('worker')

const exported = {}

const configureLog = config =>
    config && configureClient(config)

const initWorker = ({workerId}) => {
    const workerMsg = msg =>
        `${workerTag(workerId)} ${msg}`

    // initWorkerMetrics({workerId, jobName})

    const runJob = ({request$, response$}) => {
        const stop$ = new Subject()
    
        log.trace(() => workerMsg('setting up'))

        const start = ({requestId, requestTag, jobName, jobPath, initArgs, args}) => {
            const jobMsg = (taskName, msg) => [
                requestTag,
                workerMsg(`${taskTag(taskName)} ${msg || ''}`)
            ].join(' ')

            const jobModule = require(jobPath)
            const tasks = (jobModule.default || jobModule)(WORKER)
            const state = {}
        
            const tasks$ = concat(
                ...tasks.map(({jobName, worker$, finalize$}, index) =>
                    of({jobName, worker$, finalize$, args: args[index]})
                )
            )

            const next$ = request$.pipe(
                filter(({next}) => next),
                map(({next}) => next),
                filter(({requestId: currentRequestId}) => currentRequestId === requestId),
                share()
            )

            const arg$ = next$.pipe(
                filter(({arg}) => arg),
                map(({arg}) => arg),
            )

            const cmd$ = next$.pipe(
                filter(({cmd}) => cmd),
                map(({cmd}) => cmd)
            )

            const workerLog = (jobName, phase, args) =>
                log.isTrace()
                    ? args === undefined
                        ? log.trace(jobMsg(jobName, `${phase} with no args`))
                        : log.trace(jobMsg(jobName, `${phase} with args`), args)
                    : log.debug(() => jobMsg(jobName, phase))

            const worker$ = tasks$.pipe(
                tap(() => workerLog(jobName, 'worker$ running', args)),
                concatMap(({worker$, args}) =>
                    worker$({...args, requestId, requestTag, initArgs, arg$, cmd$, state})
                ),
                takeUntil(stop$),
                finalize(() => {
                    workerLog(jobName, 'worker$ finalized')
                    stop()
                    finalize$.subscribe({
                        error: error => log.error('Error in finalize$ -', error)
                    })
                })
            )

            const finalize$ = tasks$.pipe(
                tap(() => workerLog(jobName, 'finalize$ running', args)),
                concatMap(({finalize$, args}) =>
                    finalize$({...args, requestId, requestTag, initArgs, state})
                ),
                finalize(() => {
                    workerLog(jobName, 'finalize$ finalized')
                    response$.complete()
                    stop()
                })
            )

            worker$.subscribe({
                next: value => response$.next(({requestId, next: true, value})),
                error: error => response$.next({requestId, error: true, value: serializeError(toException(error))}),
                complete: () => response$.next({requestId, complete: true})
            })
        }
        
        const stop = () => {
            stop$.next()
        }
        
        request$.pipe(
            takeUntil(stop$),
            finalize(() => {
                log.trace(() => workerMsg('request stream finalized'))
                stop()
            })
        ).subscribe({
            next: message => message.start && start(message.start),
            error: error => log.fatal(workerMsg('request stream failed unexpectedly:'), error)
            // stream is allowed to complete
        })
    }

    const transportId = workerTag(workerId)
    const transport = PortTransport({
        transportId,
        port: parentPort,
        onChannel: {
            'job': ({in$: response$, out$: request$}) => runJob({request$, response$})
        }
    })

    service.initialize(transport)

    log.debug(() => workerMsg('initialized'))
}

const ready = () =>
    parentPort.postMessage({ready: true})

const {workerId, logConfig} = workerData
configureLog(logConfig)
initWorker({workerId})
ready()

export default exported
