const _ = require('lodash')
const {first} = require('rxjs/operators')
const service = require('sepal/service')

const contextService = {
    serviceName: 'ContextService',
    serviceHandler$: () => {
        const {of} = require('rxjs')
        return of(require('root/config'))
    }
}

module.exports = {
    contextService,
    getContext$: () => service.submit$(contextService).pipe(first())
}
