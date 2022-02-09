const Path = require('path')
const {stat, readdir} = require('fs/promises')
const minimatch = require('minimatch')
const {cranRepo, CRAN_ROOT, GITHUB_ROOT} = require('./config')

const BIN = Path.join(CRAN_ROOT, 'bin/contrib')

const isChildOf = (parent, dir) => {
    const relative = Path.relative(parent, dir)
    return relative && !relative.startsWith('..') && !Path.isAbsolute(relative)
}

const isCranRepoPath = path =>
    isChildOf(CRAN_ROOT, path)

const isGitHubRepoPath = path =>
    isChildOf(GITHUB_ROOT, path)

const getCranRepoPath = path => {
    const repoPath = Path.join(CRAN_ROOT, path)
    if (!isCranRepoPath(repoPath)) {
        throw new Error('Illegal path:', path)
    }
    return repoPath
}

const getGitHubRepoPath = (section, path) => {
    if (!['src', 'bin'].includes(section)) {
        throw new Error('Illegal section:', section)
    }
    const repoPath = Path.join(GITHUB_ROOT, section, path)
    if (!isGitHubRepoPath(repoPath)) {
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

const getCranPackageFilename = (name, version) =>
    `${name}_${version}.tar.gz`

const toBinaryPackagePath = requestPath =>
    requestPath.replace(/^\/src\//, '/bin/')

const isCranPackageCached = async (name, version) => {
    const path = getCranRepoPath(Path.join('bin/contrib', getCranPackageFilename(name, version)))
    return isFile(path)
}

const isGitHubPackageCached = async path =>
    isFile(getGitHubRepoPath('bin', path))

const getBinaryPackages = async () =>
    await readdir(BIN)

const getCranPackageTarget = (base, name, {archive} = {}) =>
    archive
        ? `${cranRepo}/src/contrib/Archive/${name}/${base}`
        : `${cranRepo}/src/contrib/${base}`

const getCranPackagesTarget = base =>
    `${cranRepo}/src/contrib/${base}`

const getCranTarget = (base, name, options) =>
    name === 'PACKAGES'
        ? getCranPackagesTarget(base)
        : getCranPackageTarget(base, name, options)

const getGitHubTarget = path =>
    `https://github.com/${path}`

const isUpdatable = async (name, version) => {
    const packages = await getBinaryPackages()
    const packageNameFilter = minimatch.filter(getCranPackageFilename(name, '*'))
    const packageVersionFilter = filename => filename === getCranPackageFilename(name, version)
    const matchingPackages = packages.filter(packageNameFilter)
    return matchingPackages.length !== 0
        && matchingPackages.filter(packageVersionFilter).length === 0
}

module.exports = {getCranRepoPath, getGitHubRepoPath, toBinaryPackagePath, isCranPackageCached, isGitHubPackageCached, getCranTarget, getGitHubTarget, isUpdatable}
