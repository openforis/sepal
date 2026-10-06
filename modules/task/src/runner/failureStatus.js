const GENERIC = {
    messageKey: 'tasks.status.failedGeneric',
    defaultMessage: 'The task failed. Try running it again. If the problem persists, contact the SEPAL team.'
}

// What the user sees for a failure: a message SEPAL wrote for them, Earth Engine's own reason for a failed
// export, or a generic one. Never the raw error text, which is logged instead.
export const failureStatus = error =>
    answeredByGee(error)
        ?? userMessageOf(error)
        ?? earthEngineFailure(error)
        ?? GENERIC

const answeredByGee = error => {
    try {
        const {messageKey, defaultMessage, messageArgs} = JSON.parse(error?.body)
        return messageKey ? {messageKey, defaultMessage, messageArgs} : null
    } catch (_error) {
        return null
    }
}

const userMessageOf = error =>
    error?.userMessage
        ? {messageKey: error.userMessage.key, defaultMessage: error.userMessage.message, messageArgs: error.userMessage.args}
        : null

const earthEngineFailure = error =>
    error?.earthEngineMessage
        ? {messageKey: 'tasks.status.failed', defaultMessage: `Failed: ${error.earthEngineMessage}`, messageArgs: {error: error.earthEngineMessage}}
        : null
