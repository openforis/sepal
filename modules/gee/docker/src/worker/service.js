const {ReplaySubject, Subject} = require('rxjs')
const {filter, map, share} = require('rxjs/operators')
const {v4: uuid} = require('uuid')
const {streamToPort} = require('./communication')

const serviceRequest$ = new ReplaySubject()
const serviceResponse$ = new Subject()

const handle$ = ({serviceName, requestId, data}) =>
    require(`@sepal/service/${serviceName}`).handle$(requestId, data)

const handleUpstreamMessage = (port, {jobId, value: {serviceName, requestId, data}}) => {
    handle$({serviceName, requestId, data})
        .subscribe(
            response => port.postMessage({jobId, value: {requestId, response}})
        )
}
    
const initMain = port => {
    port.on('message', message => handleUpstreamMessage(port, message))
}

const handleDownstreamMessage = message => {
    message.value && serviceResponse$.next(message.value)
}

const initWorker = port => {
    streamToPort({
        stream$: serviceRequest$,
        port,
    })
    
    port.on('message', handleDownstreamMessage)
}

const request$ = (serviceName, data) => {
    const requestId = uuid()
    serviceRequest$.next({serviceName, requestId, data})
    return serviceResponse$.pipe(
        share(),
        filter(({requestId: currentRequestId}) => currentRequestId === requestId),
        map(({value}) => value)
    )
}

module.exports = {
    initMain,
    initWorker,
    request$
}
