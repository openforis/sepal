const {Subject, defer, isObservable, takeUntil} = require('rxjs')
const log = require('#sepal/log').getLogger('service')
const {getServiceHandler$} = require('./service/registry')
const assert = require('./assert')
const {tag} = require('#sepal/tag')

const serviceTag = serviceName => tag('Service', serviceName)

const state = {}

const start = (serviceName, request$, response$) => {
    const serviceHandler$ = getServiceHandler$(serviceName)
    const stop$ = new Subject()

    request$.subscribe(
        request => {
            log.debug(`${serviceTag(serviceName)} request:`, level => request ? level.isTrace() ? request : '<omitted>' : '<no value>')
            const serviceResponse$ = serviceHandler$(request)
            assert(serviceResponse$, isObservable, 'Service request failed, response is not an observable', true)
            serviceResponse$.pipe(
                takeUntil(stop$)
            ).subscribe(
                response => {
                    log.debug(`${serviceTag(serviceName)} response:`, level => response ? level.isTrace() ? response : '<omitted>' : '<no value>')
                    response$.next(response)
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

const submitRemote$ = (service, data) => {
    const {serviceName} = service
    const {transport} = state
    const {in$: request$, out$: response$} = transport.createChannel(serviceName)
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
