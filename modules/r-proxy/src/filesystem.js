const Path = require('path')
const {stat, readdir} = require('fs/promises')

const isChildOf = (parent, dir) => {
    const relative = Path.relative(parent, dir)
    return relative && !relative.startsWith('..') && !Path.isAbsolute(relative)
}

const isFile = async path => {
    try {
        const requestStat = await stat(path)
        return requestStat.isFile()
    } catch (error) {
        return false
    }
}

const getFiles = async path =>
    await readdir(path)

module.exports = {isChildOf, isFile, getFiles}
