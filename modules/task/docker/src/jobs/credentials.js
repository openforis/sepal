const _ = require('lodash')
const service = require('sepal/service')
const {getCurrentCredentials$} = require('root/context')

const credentialsService = {
    name: 'Credentials service',
    service$: getCurrentCredentials$
}

module.exports = {
    credentialsService,
    getCurrentCredentials$: () => service.submit$(credentialsService)
}
