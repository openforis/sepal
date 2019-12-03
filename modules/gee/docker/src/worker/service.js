const {filter, first, map} = require('rxjs/operators')
const {v4: uuid} = require('uuid')
const context = require('@sepal/worker/context')

const request$ = (serviceName, data) => {
    const requestId = uuid()
    context.get('request$').next({serviceName, requestId, data})
    return context.get('response$').pipe(
        filter(({requestId: currentRequestId}) => currentRequestId === requestId),
        map(({response}) => response),
        first()
    )
}

module.exports = serviceName => {
    return {
        request$: message => request$(serviceName, message)
    }
}
