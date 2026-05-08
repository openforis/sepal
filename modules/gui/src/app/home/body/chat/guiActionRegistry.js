const handlers = {}

export const registerGuiAction = (action, handler) => {
    handlers[action] = handler
}

export const handleGuiAction = (action, params) => {
    const handler = handlers[action]
    if (!handler) {
        return false
    }
    handler(params)
    return true
}
