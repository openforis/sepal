const Path = require('path')
const {stat, readdir} = require('fs/promises')
const minimatch = require('minimatch')
const {cranRoot, cranRepo} = require('./config')

// const SRC = Path.join(cranRoot, 'src/contrib')
const BIN = Path.join(cranRoot, 'bin/contrib')

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

const isFile = async path => {
    try {
        const requestStat = await stat(path)
        return requestStat.isFile()
    } catch (error) {
        return false
    }
}

const getPackageFilename = (name, version) =>
    `${name}_${version}.tar.gz`

const getPackageInfo = path => {
    const {dir, base} = Path.parse(path)
    const VERSION_REGEX = /^(.+?)(?:_(.+?))?(\.[a-zA-Z\.]+)?$/
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
    return isFile(repoPath)
}

const isBinaryPackageCached = async (name, version) => {
    const path = getRepoPath(Path.join('bin/contrib', getPackageFilename(name, version)))
    return isFile(path)
}

const getBinaryPackages = async () =>
    await readdir(BIN)

const getPackageTarget = (base, name, {archive} = {}) =>
    archive
        ? `${cranRepo}/src/contrib/Archive/${name}/${base}`
        : `${cranRepo}/src/contrib/${base}`

const getPackagesTarget = base =>
    `${cranRepo}/src/contrib/${base}`

const getTarget = (base, name, options) =>
    name === 'PACKAGES'
        ? getPackagesTarget(base)
        : getPackageTarget(base, name, options)

const isUpdatable = async (name, version) => {
    const packages = await getBinaryPackages()
    const packageNameFilter = minimatch.filter(getPackageFilename(name, '*'))
    const packageVersionFilter = filename => filename === getPackageFilename(name, version)
    const matchingPackages = packages.filter(packageNameFilter)
    return matchingPackages.length !== 0 
        && matchingPackages.filter(packageVersionFilter).length === 0
}

        
module.exports = {getTmpPath, getRepoPath, getPackageInfo, toBinaryPackagePath, isBinaryPackage, isBinaryPackageCached, getTarget, getBinaryPackages, getPackageFilename, isUpdatable}
