const _ = require('lodash')
const service = require('sepal/service')
const {first} = require('rxjs/operators')

const contextService = {
    name: 'ContextService',
    service$: () => require('root/context').getContext$()
}

module.exports = {
    contextService,
    getContext$: () => service.submit$(contextService),
    getCurrentContext$: () => service.submit$(contextService).pipe(first())
}
