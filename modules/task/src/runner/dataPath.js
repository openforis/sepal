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

// The home's data folder is Data, which only image.DATA exports to.
export function requireWorkspacePath(workspacePath) {
    if (isWorkspaceDataPath(workspacePath)) {
        throw Object.assign(new Error(`Workspace folder is reserved for Data: ${workspacePath}`), {
            userMessage: {
                key: 'tasks.workspace.dataReserved',
                message: 'Folder "data" in your workspace is your Data. Export to the Data destination instead.'
            }
        })
    }
    return workspacePath
}

function isWorkspaceDataPath(workspacePath) {
    if (!workspacePath) {
        return false
    }
    const [first] = posix.normalize(workspacePath.replace(/^\/+/, '')).split('/').filter(segment => segment !== '' && segment !== '.')
    return first === 'data'
}
