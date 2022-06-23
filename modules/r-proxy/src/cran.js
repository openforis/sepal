const Path = require('path')
const minimatch = require('minimatch')
const {isChildOf, isFile, getFiles} = require('./filesystem')
const {cranRepo, CRAN_ROOT, libPath} = require('./config')
const {runScript} = require('./script')
const readline = require('readline')
const https = require('https')
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
    const packageNamePresent = matchingPackages.length !== 0
    const packageVersionPresent = matchingPackages.filter(packageVersionFilter).length !== 0
    return packageNamePresent && !packageVersionPresent
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
        await runScript('install_cran_package.r', [name, version, libPath, repo])
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
        await runScript('bundle_cran_package.sh', [name, version, libPath, CRAN_ROOT], {showStdOut: true, showStdErr: true})
        log.info(`Bundled ${name}/${version}`)
        return true
    } catch (error) {
        log.warn(`Could not bundle ${name}/${version}`, error)
        return false
    }
}

const makeCranPackage = async (name, version, repo) =>
    await isCranPackageCached(name, version) || await installCranPackage(name, version, repo) && await bundleCranPackage(name, version)

const updateCranPackage = async ({name, version}) => {
    if (await isUpdatable(name, version)) {
        log.debug(`Updating: ${name}/${version}`)
        const success = await makeCranPackage(name, version, cranRepo)
        return {success}
    } else {
        log.trace(`Skipping: ${name}/${version}`)
        return {success: true}
    }
}
    
const getAvailablePackages = () =>
    new Promise((resolve, reject) => {
        log.debug('Requesting PACKAGES file')
        try {
            const request = https.request(getCranTarget('PACKAGES', 'PACKAGES'), {
                method: 'GET'
            }, res => {
                if (res.statusCode === 200) {
                    log.debug('Loading PACKAGES file')
                    resolve(res)
                } else {
                    reject(res.statusCode)
                }
            })
            request.end()
        } catch (error) {
            reject(error)
        }
    })
    
const checkCranUpdates = async enqueueUpdateCranPackage => {
    log.info('Checking updated CRAN packages')
    const res = await getAvailablePackages()
    const rl = readline.createInterface({input: res})

    let name = null
    let version = null

    rl.on('line', line => {
        if (line.startsWith('Package: ')) {
            name = line.substring(9)
        }
        if (name && line.startsWith('Version: ')) {
            version = line.substring(9)
            enqueueUpdateCranPackage(name, version)
            name = null
        }
    })

    rl.on('close', () => {
        log.info('Checked availables packages')
    })
}

module.exports = {getCranRepoPath, getCranPackageInfo, isUpdatable, toBinaryPackagePath, getCranTarget, makeCranPackage, updateCranPackage, checkCranUpdates}
