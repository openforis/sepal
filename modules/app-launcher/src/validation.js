import {ClientException} from '#sepal/exception'

const validateBranchName = branch => {
    if (!branch || typeof branch !== 'string') {
        throw new ClientException('Branch name is required')
    }
    // Git branch names: alphanumeric, dot, dash, underscore, forward slash
    // Cannot start with dash, cannot contain consecutive dots, cannot end with .lock
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(branch)) {
        throw new ClientException('Invalid branch name: contains disallowed characters')
    }
    if (branch.includes('..')) {
        throw new ClientException('Invalid branch name: consecutive dots not allowed')
    }
    if (branch.endsWith('.lock')) {
        throw new ClientException('Invalid branch name: cannot end with .lock')
    }
    if (branch.length > 255) {
        throw new ClientException('Invalid branch name: too long')
    }
    return branch
}

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

export {validateAppName, validateBranchName}
