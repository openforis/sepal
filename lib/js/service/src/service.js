const {Subject} = require('rxjs')
const {takeUntil} = require('rxjs/operators')
const log = require('sepalLog')('service')

let transport

const getService$ = servicePath =>
    require(`root/${servicePath}`)

const start = (servicePath, request$, response$) => {
    const service$ = getService$(servicePath)
    const stop$ = new Subject()

    request$.subscribe(
        data => {
            data
                ? log.debug(`Service request for [${servicePath}] with data:`, data)
                : log.debug(`Service request for [${servicePath}]`)
            service$(data).pipe(
                takeUntil(stop$)
            ).subscribe(
                value => {
                    log.debug(`Service response for [${servicePath}]:`, value)
                    response$.next(value)
                },
                error => response$.error(error),
                // stream is allowed to complete
            )
        },
        error => log.error(error),
        () => stop$.next()
    )
}

const setTransport = theTransport => {
    transport = theTransport
}

const submitRemote$ = (servicePath, data) => {
    const {in$: request$, out$: response$} = transport.createChannel(servicePath)
    request$.next(data)
    return response$
}

const submitLocal$ = (servicePath, data) => {
    const service$ = getService$(servicePath)
    return service$(data)
}

const submit$ = (servicePath, data) =>
    transport
        ? submitRemote$(servicePath, data)
        : submitLocal$(servicePath, data)

module.exports = {
    start,
    setTransport,
    submit$
}
