const {filter, first, map} = require('rxjs/operators')
const {v4: uuid} = require('uuid')
const context = require('@sepal/worker/context')

const request$ = (serviceName, data) => {
    const requestId = uuid()
    context.request$.next({serviceName, requestId, data})
    return context.response$.pipe(
        filter(({requestId: currentRequestId}) => currentRequestId === requestId),
        map(({response}) => response),
        first()
    )
}

module.exports = {
    request$
}

// const {ReplaySubject, Subject} = require('rxjs')
// const {filter, first, map, share} = require('rxjs/operators')
// const {v4: uuid} = require('uuid')

// const serviceRequest$ = new ReplaySubject()
// const serviceResponse$ = new Subject()

// const init = servicePort =>
//     servicePort.on('message', message => serviceResponse$.next(message))

// const request$ = (serviceName, data) => {
//     const requestId = uuid()
//     serviceRequest$.next({serviceName, requestId, data})
//     return serviceResponse$.pipe(
//         share(),
//         filter(({requestId: currentRequestId}) => currentRequestId === requestId),
//         map(({response}) => response),
//         first()
//     )
// }

// const response$ = () => serviceResponse$

// module.exports = {
//     init,
//     request$,
//     response$
// }
