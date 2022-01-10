const Path = require('path')
const {stat} = require('fs/promises')
const {cranRoot, cranRepo} = require('./config')

const isChildOf = (parent, dir) => {
    const relative = Path.relative(parent, dir)
    return relative && !relative.startsWith('..') && !Path.isAbsolute(relative)
}

const isCranRepoPath = path =>
    isChildOf(cranRoot, path)

const getTmpPath = path =>
    getRepoPath(path) + '.tmp'

const getRepoPath = path => {
    const repoPath = Path.join(cranRoot, path)
    if (!isCranRepoPath(repoPath)) {
        throw new Error('Illegal path:', path)
    }
    return repoPath
}

const getPackageInfo = path => {
    const {dir, base} = Path.parse(path)
    const VERSION_REGEX = /^(.+?)(?:_(.+?))?(\.[a-zA-Z\.]+)$/
    const result = base.match(VERSION_REGEX)
    return result ? {
        path,
        dir,
        base,
        name: result[1],
        version: result[2],
        extension: result[3],
    } : {}
}

const toBinaryPackagePath = requestPath =>
    requestPath.replace(/^\/src\//, '/bin/')

const isBinaryPackage = async requestPath => {
    const repoPath = getRepoPath(toBinaryPackagePath(requestPath))
    try {
        const requestStat = await stat(repoPath)
        return requestStat.isFile()
    } catch (error) {
        return false
    }
}

const getPackageTarget = (base, name, {archive = false}) =>
archive
    ? `${cranRepo}/src/contrib/Archive/${name}/${base}`
    : `${cranRepo}/src/contrib/${base}`

const getPackagesTarget = base =>
`${cranRepo}/src/contrib/${base}`

const getTarget = (base, name, options) =>
name === 'PACKAGES'
    ? getPackagesTarget(base)
    : getPackageTarget(base, name, options)

module.exports = {getTmpPath, getRepoPath, getPackageInfo, toBinaryPackagePath, isBinaryPackage, getTarget}
