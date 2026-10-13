import {posix} from 'node:path'

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
    if (!workspacePath) {
        return false
    }
    const [first] = posix.normalize(workspacePath.replace(/^\/+/, '')).split('/').filter(segment => segment !== '' && segment !== '.')
    return first === 'data'
}
