const {ClientException} = require('#sepal/exception')

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

const validateRepository = repository => {
    if (!repository || typeof repository !== 'string') {
        throw new ClientException('Repository URL is required')
    }
    
    // Allow HTTPS URLs
    if (repository.startsWith('https://')) {
        try {
            const url = new URL(repository)
            // Only allow known git hosting domains or validate URL structure
            if (!url.hostname || url.hostname.length === 0) {
                throw new ClientException('Invalid repository URL: missing hostname')
            }
            if (url.search || url.hash) {
                throw new ClientException('Invalid repository URL: query strings and fragments not allowed')
            }
            // Ensure path doesn't contain shell metacharacters
            if (/[;&|`$(){}[\]<>!#*?\\]/.test(url.pathname)) {
                throw new ClientException('Invalid repository URL: contains disallowed characters')
            }
            return repository
        } catch (err) {
            if (err instanceof ClientException) throw err
            throw new ClientException('Invalid repository URL format')
        }
    }
    
    // Allow git@ SSH URLs (e.g., git@github.com:user/repo.git)
    if (/^git@[a-zA-Z0-9.-]+:[a-zA-Z0-9._/-]+\.git$/.test(repository)) {
        return repository
    }
    
    throw new ClientException('Invalid repository URL: must be HTTPS or git@ SSH URL')
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

const validatePath = (basePath, filePath) => {
    const path = require('path')
    const resolvedPath = path.resolve(basePath, filePath)
    
    if (!resolvedPath.startsWith(basePath)) {
        throw new ClientException('Invalid path: path traversal detected')
    }
    
    return resolvedPath
}

module.exports = {
    validateBranchName,
    validateRepository,
    validateAppName,
    validatePath
}
