const _ = require('lodash')
const service = require('sepal/service')

const contextService = {
    name: 'ContextService',
    service$: () => {
        const {of} = require('rx')
        return of(require('root/config'))
    }
}

module.exports = {
    contextService,
    getContext$: () => service.submit$(contextService)
}
