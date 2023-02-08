const _ = require('lodash')
const {first} = require('rxjs')
const service = require('#sepal/service')

const contextService = {
    serviceName: 'ContextService',
    serviceHandler$: () => {
        const {of} = require('rxjs')
        return of(require('#gee/config'))
    }
}

module.exports = {
    contextService,
    getContext$: () => service.submit$(contextService).pipe(first())
}
