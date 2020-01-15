const _ = require('lodash')

const registry = {}

const addServices = services =>
    _.chain(services)
        .filter(({name}) => !registry[name])
        .forEach(({name, service$}) => registry[name] = service$)
        .value()

const getService$ = name => {
    const service$ = registry[name]
    return service$
}

module.exports = {
    addServices,
    getService$
}
