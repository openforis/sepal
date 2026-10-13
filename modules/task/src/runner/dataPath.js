export function requireDataPath(path) {
    const normalized = typeof path === 'string' ? path.replace(/\/$/, '') : ''
    const valid = normalized !== ''
        && !/[\\\0]/.test(normalized)
        && !normalized.startsWith('/')
        && normalized.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..')
    if (!valid) {
        throw Object.assign(new Error(`Invalid Data folder: ${path}`), {
            userMessage: {key: 'tasks.data.invalidFolder', message: `The Data folder "${path}" is not valid.`, args: {path}}
        })
    }
    return normalized
}

export function isWorkspaceDataPath(workspacePath) {
    const segments = workspacePath.split('/').filter(segment => segment !== '' && segment !== '.')
    return segments[0] === 'data'
}
