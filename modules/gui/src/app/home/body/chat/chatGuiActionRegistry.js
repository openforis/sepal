const handlers = {}

export const registerChatGuiAction = (action, handler) => {
    handlers[action] = handler
}

export const handleChatGuiAction = (action, params) => {
    const handler = handlers[action]
    if (!handler) {
        return false
    }
    handler(params)
    return true
}
