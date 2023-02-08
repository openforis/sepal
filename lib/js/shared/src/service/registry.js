const _ = require('lodash')
const log = require('#sepal/log').getLogger('service')
const assert = require('#sepal/assert')

const serviceRegistry = {}

const addService = (serviceName, serviceHandler$) => {
    assert(serviceName, _.isString, 'Service cannot be registered: name must be a string', true)
    assert(serviceHandler$, _.isFunction, 'Service cannot be registered: service$ must be a function', true)
    if (serviceRegistry[serviceName]) {
        log.warn(`Service already registered, ignored: ${serviceName}`)
    } else {
        log.debug(`Service registered: ${serviceName}`)
        serviceRegistry[serviceName] = serviceHandler$
    }
}

const addServices = (services = []) =>
    _.chain(services)
        .filter(({serviceName}) => !serviceRegistry[serviceName])
        .forEach(({serviceName, serviceHandler$}) => addService(serviceName, serviceHandler$))
        .value()

const getServiceHandler$ = serviceName => {
    const serviceHandler$ = serviceRegistry[serviceName]
    if (!serviceHandler$) {
        log.error(`Service not registered: ${serviceName}`)
    }
    return serviceHandler$
}

module.exports = {
    addServices,
    getServiceHandler$
}
