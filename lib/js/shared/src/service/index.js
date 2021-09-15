const {Subject, defer, isObservable} = require('rxjs')
const {takeUntil} = require('rxjs/operators')
const log = require('sepal/log').getLogger('service')
const {getServiceHandler$} = require('./registry')
const assert = require('../assert')
const {v4: uuid} = require('uuid')

const state = {}

const start = (serviceName, request$, response$) => {
    const serviceHandler$ = getServiceHandler$(serviceName)
    const stop$ = new Subject()

    request$.subscribe(
        data => {
            data
                ? log.isTrace()
                    ? log.trace(`Service request for [${serviceName}] with data:`, data)
                    : log.debug(`Service request for [${serviceName}] with data: <omitted>`)
                : log.debug(`Service request for [${serviceName}]`)
            const serviceResponse$ = serviceHandler$(data)
            assert(serviceResponse$, isObservable, 'Service request failed, response is not an observable', true)
            serviceResponse$.pipe(
                takeUntil(stop$)
            ).subscribe(
                value => {
                    log.isTrace()
                        ? log.trace(`Service response for [${serviceName}]:`, value)
                        : log.debug(`Service response for [${serviceName}]: <omitted>`)
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

const initialize = transport => {
    state.transport = transport
}

// const submitRemote$ = ({serviceName}, data) => {
const submitRemote$ = (service, data) => {
    const {serviceName} = service
    const {transport} = state
    const {in$: request$, out$: response$} = transport.createChannel(`${serviceName}:${uuid()}`)
    request$.next(data)
    return response$
}

const submitLocal$ = ({serviceHandler$}, data) =>
    serviceHandler$(data)

const submit$ = (service, data) =>
    defer(() => {
        const {transport} = state
        return transport
            ? submitRemote$(service, data)
            : submitLocal$(service, data)
    })

module.exports = {
    initialize,
    start,
    submit$
}
