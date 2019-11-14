require('module-alias/register')
const {parentPort} = require('worker_threads')
const {Subject, of, concat} = require('rxjs')
const {mergeMap, takeUntil, tap} = require('rxjs/operators')
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

    const next = value => {
        log.trace(msg(`emitted value: ${value}`))
        return jobPort.postMessage({value})
    }

    const error = error => {
        log.trace(msg(`error: ${error}`))
        return jobPort.postMessage({error: serializeError(error)})
    }

    const complete = () => {
        log.trace(msg('complete'))
        return jobPort.postMessage({complete: true})
    }

    const start = ({jobPath, args}) => {
        const tasks = require(jobPath)()
        log.trace(msg('starting job'))

        const tasks$ = _.chain(tasks)
            .zip(args)
            .map(([{jobName, worker$}, args]) =>
                of({jobName, worker$, args})
            )
            .value()

        run(tasks$)
    }

    const run = tasks$ => {
        concat(...tasks$).pipe(
            tap(({jobName, args}) =>
                log.trace(msg(`running ${jobName} with args:`), args)
            ),
            mergeMap(({worker$, args}) => worker$(...args), 1),
            takeUntil(stop$)
        ).subscribe({next, error, complete})
    }

    const stop = () => {
        log.trace(msg('stopping job'))
        stop$.next()
    }

    const handleMessage = message => {
        message.start && start(message.start)
        message.stop && stop()
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
