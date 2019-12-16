const {map, first, finalize} = require('rxjs/operators')
const log = require('@sepal/log')

let transport

const initMain = (request$, response$) => {
    const handle$ = ({serviceName, data}) =>
        require(`@sepal/service/${serviceName}`).handle$(data)

    request$.subscribe(
        ({serviceName, data}) => {
            log.warn(`Received a service request for [${serviceName}] with data:`, data)
            return handle$({serviceName, data}).subscribe({
                next: value => {
                    log.warn(`Sending a service response for [${serviceName}]:`, value)
                    response$.next(value)
                    response$.complete()
                },
                error: error => log.error('ERROR', error),
                complete: () => log.error('COMPLETE')
            })
        }
    )
}

const initWorker = theTransport => {
    transport = theTransport
}

const request$ = (serviceName, data) => {
    const {in$: request$, out$: response$} = transport.createChannel('service')
    
    request$.next({serviceName, data})
    return response$.pipe(
        map(({value}) => value),
        first()
    )
}

module.exports = {
    initMain,
    initWorker,
    request$
}
