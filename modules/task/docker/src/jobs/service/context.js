const _ = require('lodash')
const service = require('sepal/service')
const {getContext$} = require('root/context')
const {first} = require('rx/operators')

const contextService = {
    name: 'ContextService',
    service$: getContext$
}

module.exports = {
    contextService,
    getContext$: () => service.submit$(contextService).pipe(first())
}
