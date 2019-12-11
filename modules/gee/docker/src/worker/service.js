const {ReplaySubject, Subject} = require('rxjs')
const {filter, map, share, first} = require('rxjs/operators')
const {v4: uuid} = require('uuid')
const log = require('../log')

const serviceRequest$ = new ReplaySubject()
const serviceResponse$ = new Subject()

const initMain = (in$, out$) => {
    const handle$ = ({serviceName, requestId, data}) =>
        require(`@sepal/service/${serviceName}`).handle$(requestId, data)

    out$.subscribe(
        ({serviceName, requestId, data}) => {
            log.warn('service request:', {serviceName, requestId, data})
            handle$({serviceName, requestId, data}).subscribe({
                next: value => {
                    in$.next(value)
                },
                error: error => in$.error(error),
                complete: () => in$.complete()
            })
        }
    )
}

const initWorker = (in$, out$) => {
    serviceRequest$.subscribe({
        next: request => in$.next(request)
    })
    out$.subscribe({
        next: response => {
            log.warn('got service response', response)
            serviceResponse$.next(response)
        }
    })
}

const request$ = (serviceName, data) => {
    const requestId = uuid()
    serviceRequest$.next({serviceName, requestId, data})
    return serviceResponse$.pipe(
        share(),
        filter(({requestId: currentRequestId}) => currentRequestId === requestId),
        map(({value}) => value),
        first()
    )
}

module.exports = {
    initMain,
    initWorker,
    request$
}
