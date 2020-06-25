const _ = require('lodash')
const log = require('sepal/log').getLogger('service')
const assert = require('sepal/assert')

const registry = {}

const addService = (name, service$) => {
    assert(name, _.isString, 'Service cannot be registered: name must be a string', true)
    assert(service$, _.isFunction, 'Service cannot be registered: service$ must be a function', true)
    if (registry[name]) {
        log.warn(`Service already registered, ignored: ${name}`)
    } else {
        log.debug(`Service registered: ${name}`)
        registry[name] = service$
    }
}

const addServices = services =>
    _.chain(services)
        .filter(({name}) => !registry[name])
        .forEach(({name, service$}) => addService(name, service$))
        .value()

const getService$ = name => {
    const service$ = registry[name]
    if (!service$) {
        log.error(`Service not registered: ${name}`)
    }
    return service$
}

module.exports = {
    addServices,
    getService$
}
