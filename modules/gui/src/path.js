// Browser equivalents of Node's path.posix functions, for slash-separated paths such as EE asset ids
// and user workspace paths

export const dirname = path => {
    if (path.length === 0) {
        return '.'
    }
    const hasRoot = path[0] === '/'
    const end = parentEnd(path)
    if (end === -1) {
        return hasRoot ? '/' : '.'
    }
    // POSIX leaves a leading double slash implementation-defined, and Node preserves it
    if (hasRoot && end === 1) {
        return '//'
    }
    return path.substring(0, end)
}

export const extname = path => {
    const name = basename(path)
    const index = name.lastIndexOf('.')
    return index > 0 && name !== '..' ? name.substring(index) : ''
}

const parentEnd = path => {
    let afterName = false
    for (let i = path.length - 1; i >= 1; --i) {
        if (path[i] !== '/') {
            afterName = true
        } else if (afterName) {
            return i
        }
    }
    return -1
}

const basename = path => {
    const trimmed = path.replace(/\/+$/, '')
    return trimmed.substring(trimmed.lastIndexOf('/') + 1)
}
