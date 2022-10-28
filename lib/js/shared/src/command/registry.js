const handlers = {}

const registerCommandHandler = (commandClass, handler) => {
    return handlers[commandClass.name] = handler
}

const lookupCommandHandler = type =>
    handlers[type.name]

module.exports = {
    registerCommandHandler,
    lookupCommandHandler
}
