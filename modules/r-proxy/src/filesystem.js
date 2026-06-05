import Path from 'path'
import {stat, readdir} from 'fs/promises'

const isChildOf = (parent, dir) => {
    const relative = Path.relative(parent, dir)
    return relative && !relative.startsWith('..') && !Path.isAbsolute(relative)
}

const isFile = async path => {
    try {
        const requestStat = await stat(path)
        return requestStat.isFile()
    } catch (_error) {
        return false
    }
}

const getFiles = async path =>
    await readdir(path)

export {isChildOf, isFile, getFiles}
