import {AsyncLocalStorage} from 'async_hooks'
import {defer, isObservable, Observable, Subject, takeUntil} from 'rxjs'

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

// A channel's responses arrive on the transport's message handler, registered when the transport was
// created - so a continuation resuming from one runs outside whatever asynchronous context submitted
// the request, and execution-scoped state established by the caller, such as the recipe operation a
// job is running in, would be gone from everything downstream of the round trip.
const inCallerContext = source$ => {
    const runInCallerContext = AsyncLocalStorage.snapshot()
    return new Observable(subscriber => source$.subscribe({
        next: value => runInCallerContext(() => subscriber.next(value)),
        error: error => runInCallerContext(() => subscriber.error(error)),
        complete: () => runInCallerContext(() => subscriber.complete())
    }))
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
            ? inCallerContext(submitRemote$(service, data))
            : submitLocal$(service, data)
    })

export {
    initialize,
    start,
    submit$
}
