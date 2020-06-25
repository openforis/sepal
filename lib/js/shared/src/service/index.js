const {Subject, defer, isObservable} = require('rx')
const {takeUntil, first, finalize} = require('rx/operators')
const log = require('sepal/log').getLogger('service')
const {getService$} = require('./registry')
const assert = require('../assert')

const state = {}

const start = (serviceName, request$, response$) => {
    const service$ = getService$(serviceName)
    const stop$ = new Subject()

    request$.subscribe(
        data => {
            data
                ? log.isTrace()
                    ? log.trace(`Service request for [${serviceName}] with data:`, data)
                    : log.debug(`Service request for [${serviceName}] with data: <omitted>`)
                : log.debug(`Service request for [${serviceName}]`)
            const serviceResponse$ = service$(data)
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

const initialize = ({transport, id}) => {
    state.transport = transport
    state.id = id
}

const submitRemote$ = (service, data) => {
    const {transport, id} = state
    const serviceName = service.name
    // [TODO] check for existing service
    // if (!serviceName)
    //     throw new Error(`No service: ${serviceName}`)
    const {in$: request$, out$: response$} = transport.createChannel(`${id}.service`, serviceName)
    // const {in$: request$, out$: response$} = transport.createChannel(serviceName)
    request$.next(data)
    return response$.pipe(
        first(),
        finalize(() => request$.complete())
    )
}

const submitLocal$ = ({service$}, data) =>
    service$(data)

const submit$ = (service, data) => defer(() => {
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
