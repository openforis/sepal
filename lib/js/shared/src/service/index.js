const {Subject, from} = require('rxjs')
const {takeUntil} = require('rxjs/operators')
const log = require('sepal/log')('service')
const {getService$} = require('./registry')

let transport

const start = (serviceName, request$, response$) => {
    const service$ = getService$(serviceName)
    const stop$ = new Subject()

    request$.subscribe(
        data => {
            data
                ? log.debug(`Service request for [${serviceName}] with data:`, data)
                : log.debug(`Service request for [${serviceName}]`)
                
            from(service$(data)).pipe( // [HACK] https://github.com/ReactiveX/rxjs/issues/5237 (not necessary in this case?)
                takeUntil(stop$)
            ).subscribe(
                value => {
                    log.debug(`Service response for [${serviceName}]:`, value)
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

const submitRemote$ = (service, data) => {
    const serviceName = service.name
    // [TODO] check for existing service
    // if (!serviceName)
    //     throw new Error(`No service: ${serviceName}`)
    const {in$: request$, out$: response$} = transport.createChannel(serviceName)
    request$.next(data)
    return response$
}

const submitLocal$ = ({service$}, data) =>
    from(service$(data)) // [HACK] https://github.com/ReactiveX/rxjs/issues/5237 (not necessary in this case?)

const submit$ = (service, data) =>
    transport
        ? submitRemote$(service, data)
        : submitLocal$(service, data)

module.exports = {
    start,
    setTransport,
    submit$
}
