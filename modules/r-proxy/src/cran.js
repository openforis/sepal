const Path = require('path')
const minimatch = require('minimatch')
const {isChildOf, isFile, getFiles} = require('./filesystem')
const {cranRepo, CRAN_ROOT, libPath} = require('./config')
const {runScript} = require('./script')
const readline = require('readline')
const https = require('https')
const log = require('#sepal/log').getLogger('cran')
const {compare} = require('compare-versions')
const {makePackage, cleanupPackage} = require('./package')

const SRC = 'src/contrib'
const BIN = 'bin/contrib'
const TMP = '.bin/contrib'

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
    const packages = await getFiles(Path.join(CRAN_ROOT, BIN))
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

const isCranPackageCached = async (name, version) =>
    isFile(getCranRepoPath(Path.join(BIN, getCranPackageFilename(name, version))))
        
const installCranPackage = async (name, version, repo) => {
    try {
        log.info(`Installing ${name}/${version}`)
        await runScript('install_cran_package.r', [name, version, libPath, repo])
        log.info(`Installed ${name}/${version}`)
        return true
    } catch (error) {
        log.warn(`Could not install ${name}/${version}`, error)
        return false
    }
}
    
const makeCranPackage = async (name, version, repo) => {
    const packageFilename = `${name}_${version}.tar.gz`
    const srcPath = Path.join(CRAN_ROOT, SRC, packageFilename)
    const binPath = Path.join(CRAN_ROOT, BIN, packageFilename)
    const tmpPath = Path.join(CRAN_ROOT, TMP, packageFilename)
    const success = await isCranPackageCached(name, version) || (
        await installCranPackage(name, version, repo) && await makePackage(name, srcPath, binPath, tmpPath)
    )
    await cleanupPackage(name, srcPath, binPath, tmpPath)
    return success
}

const updateCranPackage = async ({name, version}) => {
    if (await isUpdatable(name, version)) {
        log.info(`Updating: ${name}/${version}`)
        const success = await makeCranPackage(name, version, cranRepo)
        return {success}
    } else {
        log.debug(`Skipping: ${name}/${version}`)
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

const getInstalledVersion = async () => {
    const R_VERSION_MATCHER = /^R version (\S*)/
    log.debug('Detecting R version')
    const versionInfo = await runScript('get_r_version.sh')
    const [, version] = versionInfo.match(R_VERSION_MATCHER)
    log.info('Detected R version:', version)
    return version
}

const isVersionSatisfied = ({name, version, depends, installedVersion}) => {
    const R_VERSION_MATCHER = /(?:^|,)R\(>=(.*?)\)(?:$|,)/
    log.debug(`Validating ${name}/${version}`)
    if (depends) {
        const dependsR = depends.replaceAll(' ', '').match(R_VERSION_MATCHER)
        if(dependsR && dependsR[1]) {
            const requiredVersion = dependsR[1].replace('-', '.') // fix packages having wrong R version format
            try {
                if (compare(installedVersion, requiredVersion, '>=')) {
                    log.debug(`Validated ${name}/${version}`)
                } else {
                    log.info(`Skipping ${name}/${version}: requires R >= ${requiredVersion}`)
                    return false
                }
            } catch (error) {
                log.warn(`Cannot compare R version for ${name}/${version}:`, dependsR[1])
            }
        }
    }
    return true // being optimistic
}
    
const checkCranUpdates = async enqueueUpdateCranPackage => {
    log.info('Checking updated CRAN packages')
    const installedVersion = await getInstalledVersion()
    const res = await getAvailablePackages()
    const rl = readline.createInterface({input: res})

    const property = (() => {
        let buffer = ''
        return {
            set: text => buffer = text,
            append: text => buffer += ` ${text.trim()}`,
            hasData: () => buffer.length !== 0,
            get: () => buffer.split(': ')
        }
    })()

    const entry = (() => {
        let buffer = {}
        return {
            reset: () => buffer = {},
            set: ([key, value]) => buffer[key.trim()] = value.trim(),
            get: () => buffer
        }
    })()

    rl.on('line', line => {
        if (line.length) {
            if (line.startsWith(' ')) {
                // continuation of previous property: join
                property.append(line)
            } else {
                // new property: process previous property
                if (property.hasData()) {
                    entry.set(property.get())
                }
                property.set(line)
            }
        } else {
            // no more properties: process previous entry
            const {Package: name, Version: version, Depends: depends} = entry.get()
            if (name && version) {
                if (isVersionSatisfied({name, version, depends, installedVersion})) {
                    enqueueUpdateCranPackage(name, version)
                }
            }
            entry.reset()
        }
    })

    rl.on('close', () => {
        log.info('Checked availables packages')
    })
}

module.exports = {getCranRepoPath, getCranPackageInfo, isUpdatable, toBinaryPackagePath, getCranTarget, makeCranPackage, updateCranPackage, checkCranUpdates}
