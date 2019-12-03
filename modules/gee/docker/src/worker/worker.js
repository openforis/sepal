require('module-alias/register')
const {parentPort} = require('worker_threads')
const {ReplaySubject, Subject, of, concat} = require('rxjs')
const {map, mergeMap, takeUntil, tap, filter, share} = require('rxjs/operators')
const {serializeError} = require('serialize-error')
const _ = require('lodash')
const log = require('@sepal/log')
const context = require('./context')

const exported = {}
const request$ = new ReplaySubject()
const response$ = new Subject()
context.request$ = request$
context.response$ = response$.pipe(share())

parentPort.once('message', ({name, ports}) => {
    const args$ = new Subject()
    const stop$ = new Subject()
    const jobPort = ports.job

    const servicePort = ports.service
    servicePort.on('message', message => response$.next(message))
    exported.ports = ports

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
        const next = value => {
            log.trace(msg(`value: ${JSON.stringify(value)}`, jobId))
            return jobPort.postMessage({jobId, ...value})
        }

        const error = error => {
            log.trace(msg(`error: ${error}`, jobId))
            return jobPort.postMessage({jobId, error: serializeError(error)})
        }

        const complete = () => {
            log.trace(msg('complete', jobId))
            return jobPort.postMessage({jobId, complete: true})
        }

        const job$ = concat(...tasks$).pipe(
            tap(({jobName, args}) =>
                log.trace(msg(`running <${jobName}> with args:`, jobId), args)
            ),
            mergeMap(({worker$, args}) => worker$(...args, args$), 1),
            takeUntil(stop$.pipe(filter(id => id === jobId)))
        )

        request$.pipe(
            map(request => ({request}))
        ).subscribe(next)

        job$.pipe(
            map(value => ({value}))
        ).subscribe({next, error, complete})
    }

    const stop = ({jobId}) => {
        log.trace(msg('stop', jobId))
        stop$.next(jobId)
    }

    const next = ({jobId, value}) => {
        args$.next({jobId, value})
    }

    const handleMessage = message => {
        message.start && start(message)
        message.stop && stop(message)
        message.value && next(message)
        message.response && response$.next(message.response)
    }

    const init = () => {
        log.trace(msg('ready'))
        jobPort.on('message', handleMessage)
        parentPort.postMessage('READY')
    }

    init()
})

module.exports = exported
