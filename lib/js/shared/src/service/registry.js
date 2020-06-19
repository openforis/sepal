const _ = require('lodash')
const log = require('sepal/log').getLogger('service')

const registry = {}

const addService = (name, service$) => {
    if (registry[name]) {
        log.warn(`Service already registered, ingnored: ${name}`)
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
