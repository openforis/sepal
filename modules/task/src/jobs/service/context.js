const _ = require('lodash')
const service = require('#sepal/service')
const {first} = require('rxjs')

const contextService = {
    serviceName: 'ContextService',
    serviceHandler$: () => require('#task/context').getContext$()
}

module.exports = {
    contextService,
    getContext$: () => service.submit$(contextService),
    getCurrentContext$: () => service.submit$(contextService).pipe(first())
}
