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

    const msg = (msg, jobId) => [
        `Worker [${name}${jobId ? `.${jobId.substr(-4)}` : ''}]`,
        msg
    ].join(' ')

    const start = ({jobId, jobPath, args}) => {
        log.trace(msg('start', jobId))
        
        const next = value => {
            log.trace(msg(`value: ${value}`, jobId))
            return jobPort.postMessage({jobId, value})
        }
    
        const error = error => {
            log.trace(msg(`error: ${error}`, jobId))
            return jobPort.postMessage({jobId, error: serializeError(error)})
        }
    
        const complete = () => {
            log.trace(msg('complete', jobId))
            return jobPort.postMessage({jobId, complete: true})
        }
    
        const tasks = require(jobPath)()

        const tasks$ = _.chain(tasks)
            .zip(args)
            .map(([{jobName, worker$}, args]) =>
                of({jobName, worker$, args})
            )
            .value()

        concat(...tasks$).pipe(
            mergeMap(({worker$, args}) => worker$(...args), 1),
            tap(({jobName, args}) =>
                log.trace(msg(`running <${jobName}> with args:`, jobId), args)
            ),
            takeUntil(stop$.pipe(filter(id => id === jobId)))
        ).subscribe({next, error, complete})
    }

    const stop = ({jobId}) => {
        log.trace(msg('stop', jobId))
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
