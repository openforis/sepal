const {parentPort} = require('worker_threads')
const {Subject} = require('rxjs')
const {takeUntil} = require('rxjs/operators')
const log = require('../log')

const exported = {}

const authenticate = ({modulePath, args}) => {
    const func = require(modulePath)
    return func(args)
}

parentPort.once('message', ports => {
    const stop$ = new Subject()
    exported.ports = ports
    const jobPort = ports.job

    const start = ({modulePath, args}) => {
        const {name, job} = require(modulePath)
        log.info(`Starting worker ${name}`)
        const worker$ = job(...args)
        worker$.pipe(
            takeUntil(stop$)
        ).subscribe(
            value => jobPort.postMessage({value}),
            error => jobPort.postMessage({error}),
            () => jobPort.postMessage({complete: true})
        )
    }

    const stop = () => {
        log.info('Stopping worker')
        stop$.next()
        jobPort.off('message', handleMessage)
    }

    const handleMessage = async message => {
        if (message.start) {
            const {auth, job} = message.start
            if (auth) {
                await authenticate(auth)
            }
            start(job)
        }
        if (message.stop) {
            stop()
        }
    }
    jobPort.on('message', handleMessage)
    parentPort.postMessage('READY')
})

module.exports = exported
