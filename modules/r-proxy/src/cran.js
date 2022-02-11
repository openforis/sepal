const Path = require('path')
const minimatch = require('minimatch')
const {isChildOf, isFile, getFiles} = require('./filesystem')
const {cranRepo, CRAN_ROOT, libPath} = require('./config')
const {runScript} = require('./script')
const log = require('sepal/log').getLogger('cran')

const BIN = Path.join(CRAN_ROOT, 'bin/contrib')

const isCranRepoPath = path =>
    isChildOf(CRAN_ROOT, path)

const getCranRepoPath = path => {
    const repoPath = Path.join(CRAN_ROOT, path)
    if (!isCranRepoPath(repoPath)) {
        throw new Error('Illegal path:', path)
    }
    return repoPath
}

const getCranPackageInfo = path => {
    const {dir, base} = Path.parse(path)
    const VERSION_REGEX = /^(.+?)(?:_(.+?))?(\.[a-zA-Z.]+)?$/
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

const getCranPackageFilename = (name, version) =>
    `${name}_${version}.tar.gz`

const isUpdatable = async (name, version) => {
    const packages = await getFiles(BIN)
    const packageNameFilter = minimatch.filter(getCranPackageFilename(name, '*'))
    const packageVersionFilter = filename => filename === getCranPackageFilename(name, version)
    const matchingPackages = packages.filter(packageNameFilter)
    return matchingPackages.length !== 0
        && matchingPackages.filter(packageVersionFilter).length === 0
}

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

const toBinaryPackagePath = requestPath =>
    requestPath.replace(/^\/src\//, '/bin/')

const isCranPackageCached = async (name, version) => {
    const path = getCranRepoPath(Path.join('bin/contrib', getCranPackageFilename(name, version)))
    return isFile(path)
}
        
const installCranPackage = async (name, version, repo) => {
    try {
        log.debug(`Installing ${name}/${version}`)
        await runScript('src/R/install_cran_package.r', [name, version, libPath, repo])
        log.info(`Installed ${name}/${version}`)
        return true
    } catch (error) {
        log.warn(`Could not install ${name}/${version}`, error)
        return false
    }
}
    
const bundleCranPackage = async (name, version) => {
    try {
        log.debug(`Bundling ${name}/${version}`)
        await runScript('src/R/bundle_cran_package.sh', [name, version, libPath, CRAN_ROOT], {showStdOut: true, showStdErr: true})
        log.info(`Bundled ${name}/${version}`)
        return true
    } catch (error) {
        log.warn(`Could not bundle ${name}/${version}`, error)
        return false
    }
}

const makeCranPackage = async (name, version, repo) =>
    await isCranPackageCached(name, version) || await installCranPackage(name, version, repo) && await bundleCranPackage(name, version)
    
module.exports = {getCranRepoPath, getCranPackageInfo, isUpdatable, toBinaryPackagePath, getCranTarget, makeCranPackage}
