import {ClientException} from '#sepal/exception'

const validateAppName = appName => {
    if (!appName || typeof appName !== 'string') {
        throw new ClientException('App name is required')
    }
    // App names: alphanumeric, dot, dash, underscore (must start with alphanumeric)
    // No slashes, no consecutive dots (to prevent path traversal)
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(appName)) {
        throw new ClientException('Invalid app name: contains disallowed characters')
    }
    if (appName.includes('..')) {
        throw new ClientException('Invalid app name: consecutive dots not allowed')
    }
    if (appName.length > 128) {
        throw new ClientException('Invalid app name: too long')
    }
    return appName
}

export {validateAppName}
