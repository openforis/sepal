import path from 'node:path'
import {Worker} from 'node:worker_threads'

import _ from 'lodash'
import {catchError, defer, filter, finalize, first, merge, of, retry, Subject, Subscription, switchMap, takeUntil} from 'rxjs'

import {getLogConfig, getLogger} from '#sepal/log'
import {dirName} from '#sepal/path'
import * as service from '#sepal/service'

import {PortTransport} from '../rxjs/transport/port.js'
import {workerTag} from './tag.js'

const __dirname = dirName(import.meta.url)
const log = getLogger('factory')

const WORKER_PATH = path.join(__dirname, 'worker.js')
const RESTART_DELAY_MS = 1000

const bootstrapWorker$ = ({workerId, env}) => {
    const worker$ = new Subject()
    const logConfig = getLogConfig()
    const worker = new Worker(WORKER_PATH, {
        workerData: {workerId, logConfig},
        env
    })
    
    const workerMsg = msg =>
        `${workerTag(workerId)} ${msg}`

    worker.on('online', () => {
        log.debug(workerMsg('online'))
    })
    worker.on('error', error => {
        log.error(workerMsg('error'), error)
    })
    worker.on('messageerror', error => {
        log.error(workerMsg('messageerror'), error)
    })
    worker.on('exit', exitCode => {
        log.debug(workerMsg('exit'))
        worker$.error(exitError(workerId, exitCode))
    })
    worker.on('message', message => {
        message.ready && worker$.next(worker)
    })

    return worker$.pipe(first())
}

const setupWorker$ = ({workerId, worker}) => {
    const transportId = workerTag(workerId)
    const transport = PortTransport({
        transportId,
        port: worker,
        onChannel: ({conversationGroupId: serviceName, in$: response$, out$: request$}) => {
            if (serviceName) {
                service.start(serviceName, request$, response$)
            }
        }
    })

    // Pooled threads live as long as the pool; they must not keep the process alive on their own. Adding a
    // 'message' listener refs the worker again, so this follows the transport's.
    worker.unref()

    const workerMsg = msg =>
        `${workerTag(workerId)} ${msg}`

    // A dead worker never replies, so its jobs fail instead. An errored Subject errors late subscribers too.
    const exit$ = new Subject()
    worker.once('exit', exitCode => exit$.error(exitError(workerId, exitCode)))

    const submit$ = ({jobName, jobPath, requestId, requestTag, initArgs, args, arg$, cmd$, cancel$}) => {
        const {in$: request$, out$: response$} = transport.createChannel('job')

        // The input subscriptions must be released when the job ends, or they permanently pin
        // their sources — e.g. a refCounted cmd$ would keep its upstream (the module-level
        // cancellation subjects) subscribed once per job ever run.
        const inputSubscriptions = new Subscription()

        const start = () => {
            log.debug(workerMsg('start'))
            request$.next({start: {requestId, requestTag, jobName, jobPath, initArgs, args}})
        }

        const stop = () => {
            log.debug(workerMsg('stop'))
            inputSubscriptions.unsubscribe()
            request$.complete()
        }

        arg$ && inputSubscriptions.add(arg$.subscribe(
            arg => request$.next({next: {requestId, arg}})
        ))

        cmd$ && inputSubscriptions.add(cmd$.subscribe(
            cmd => request$.next({next: {requestId, cmd}})
        ))

        cancel$ && inputSubscriptions.add(cancel$.subscribe(
            () => stop()
        ))

        setImmediate(() => start())

        // exit$ never completes: it must end with the job's responses, or the job is never released.
        const responseEnded$ = new Subject()
        return merge(
            response$.pipe(finalize(() => responseEnded$.next())),
            exit$.pipe(takeUntil(responseEnded$))
        ).pipe(
            catchError(error => of({requestId, error: true, value: error})),
            filter(message => message.requestId === requestId),
            finalize(() => stop())
        )
    }

    const dispose = () => {
        log.debug(workerMsg('dispose'))
        worker.terminate()
        transport.dispose()
    }

    return merge(of(submit$), exit$).pipe(
        finalize(() => dispose())
    )
}

const exitError = (workerId, exitCode) =>
    new Error(`${workerTag(workerId)} exited with code ${exitCode}`)

// A worker configures itself from its own environment. `env` states that environment for a caller that
// cannot rely on the process it happens to run in; without it the worker inherits the process environment,
// which is Node's own default.
const initWorker$ = ({workerId, env}) =>
    defer(() => bootstrapWorker$({workerId, env})).pipe(
        switchMap(worker => setupWorker$({workerId, worker})),
        retry({delay: RESTART_DELAY_MS})
    )

const WORKER = Symbol()

export {initWorker$, WORKER}
