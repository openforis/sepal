const {ReplaySubject, Subject} = require('rxjs')
const {filter, map, share, first} = require('rxjs/operators')
const {v4: uuid} = require('uuid')

const serviceRequest$ = new ReplaySubject()
const serviceResponse$ = new Subject()

const initMain = (request$, response$) => {
    const handle$ = ({serviceName, requestId, data}) =>
        require(`@sepal/service/${serviceName}`).handle$(requestId, data)

    request$.subscribe(
        ({serviceName, requestId, data}) =>
            handle$({serviceName, requestId, data}).subscribe(
                value => response$.next(value)
            )
    )
}

const initWorker = (request$, response$) => {
    serviceRequest$.subscribe(
        request => request$.next(request)
    )
    response$.subscribe(
        response => serviceResponse$.next(response)
    )
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
