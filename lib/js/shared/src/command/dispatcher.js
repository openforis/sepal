const {lookupCommandHandler} = require('./registry')

class Dispatcher {
    constructor(services) {
        this.services = services
    }

    submit$(command) {
        const handler$ = lookupCommandHandler(command.constructor)
        if (!handler$) {
            throw Error('No handler registered for command of type ', command.constructor.name)
        }
        return handler$({services: this.services, command})
    }
}

module.exports = {Dispatcher}
