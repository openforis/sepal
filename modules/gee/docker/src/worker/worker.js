require('module-alias/register')
const {parentPort} = require('worker_threads')
const {Subject, of, concat} = require('rxjs')
const {mergeMap, takeUntil, tap, filter} = require('rxjs/operators')
const {serializeError} = require('serialize-error')
const _ = require('lodash')
const log = require('@sepal/log')

const exported = {}

parentPort.once('message', ({name, ports}) => {
    const stop$ = new Subject()
    const jobPort = ports.job
    exported.ports = ports

    const msg = msg =>
        `[Worker <${name}>] ${msg}`

    const start = ({jobId, jobPath, args}) => {
        const tasks = require(jobPath)()
        log.trace(msg(`start job <${jobId.substr(-4)}>`))

        const tasks$ = _.chain(tasks)
            .zip(args)
            .map(([{jobName, worker$}, args]) =>
                of({jobName, worker$, args})
            )
            .value()

        run(jobId, tasks$)
    }

    const run = (jobId, tasks$) => {
        const next = value => {
            log.trace(msg(`emitted value: ${value}`))
            return jobPort.postMessage({jobId, value})
        }
    
        const error = error => {
            log.trace(msg(`error: ${error}`))
            return jobPort.postMessage({jobId, error: serializeError(error)})
        }
    
        const complete = () => {
            log.trace(msg('complete'))
            return jobPort.postMessage({jobId, complete: true})
        }
    
        concat(...tasks$).pipe(
            tap(({jobName, args}) =>
                log.trace(msg(`running ${jobName} with args:`), args)
            ),
            mergeMap(({worker$, args}) => worker$(...args), 1),
            takeUntil(stop$.pipe(filter(id => id === jobId)))
        ).subscribe({next, error, complete})
    }

    const stop = ({jobId}) => {
        log.trace(msg(`stop job <${jobId.substr(-4)}>`))
        stop$.next(jobId)
    }

    const handleMessage = message => {
        message.start && start(message.start)
        message.stop && stop(message.stop)
        message.dispose && dispose()
    }

    const init = () => {
        log.trace(msg('ready'))
        jobPort.on('message', handleMessage)
        parentPort.postMessage('READY')
    }

    const dispose = () => {
        log.debug(msg('dispose'))
        jobPort.off('message', handleMessage)
    }

    init()
})

module.exports = exported
