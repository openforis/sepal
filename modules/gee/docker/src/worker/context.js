const asyncHooks = require('async_hooks');

const contexts = {}

const init = (asyncId, type, triggerId) => {
    const triggerContext = contexts[triggerId]
    if (triggerContext) {
        contexts[asyncId] = triggerContext
    } else {
        contexts[asyncId] = {}
    }
}

const destroy = asyncId => {
    delete contexts[asyncId]
}

const getContext = () => {
    const asyncId = asyncHooks.executionAsyncId()
    const context = contexts[asyncId]
    if (!context) {
        contexts[asyncId] = {}
        return contexts[asyncId]
    } else {
        return context
    }
}

const get = key => {
    const context = getContext()
    if (Object.keys(context).includes(key)) {
        return context[key]
    } else {
        throw new Error(`Context doesn't contain key ${key}. Got ${Object.keys(context)}`)
    }
}

const set = (key, value) => {
    return getContext()[key] = value
}

asyncHooks.createHook({ init, destroy }).enable()

module.exports = {get, set}
