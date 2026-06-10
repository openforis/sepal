import {defer, isObservable, Subject, takeUntil} from 'rxjs'

import {assert} from '#sepal/assert'
import {getLogger} from '#sepal/log'
import {tag} from '#sepal/tag'

import {getServiceHandler$} from './service/registry.js'

const log = getLogger('service')

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
    const {in$: request$, out$: response$} = transport.createChannel(serviceName, {linked: true})
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

export {
    initialize,
    start,
    submit$
}
