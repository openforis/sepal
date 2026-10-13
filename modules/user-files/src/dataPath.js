import Path from 'node:path'

export const DATA_REFUSED_MESSAGE = 'Data is managed by user-data'

export function isDataPath(relativePath) {
    const [first] = Path.posix.normalize(relativePath).replace(/^\/+/, '').split('/')
    return first === 'data'
}
