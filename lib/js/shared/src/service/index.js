const {Subject} = require('rx')
const {takeUntil} = require('rx/operators')
const log = require('sepal/log').getLogger('service')
const {getService$} = require('./registry')

const state = {}

const start = (serviceName, request$, response$) => {
    const service$ = getService$(serviceName)
    const stop$ = new Subject()

    request$.subscribe(
        data => {
            data
                ? log.debug(`Service request for [${serviceName}] with data:`, data)
                : log.debug(`Service request for [${serviceName}]`)

            service$(data).pipe(
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
    return response$
}

const submitLocal$ = ({service$}, data) =>
    service$(data)

const submit$ = (service, data) => {
    const {transport} = state
    return transport
        ? submitRemote$(service, data)
        : submitLocal$(service, data)
}

module.exports = {
    initialize,
    start,
    submit$
}
