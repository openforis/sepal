const Path = require('path')
const minimatch = require('minimatch')
const {isChildOf, isFile, getFiles} = require('./filesystem')
const {cranRepo, CRAN_ROOT, libPath} = require('./config')
const {runScript} = require('./script')
const readline = require('readline')
const https = require('https')
const log = require('#sepal/log').getLogger('cran')
const {compare} = require('compare-versions')

const CONTRIB = 'bin/contrib'
const CONTRIB_UNVERIFIED = 'bin/contrib-unverified'

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
    const packages = await getFiles(Path.join(CRAN_ROOT, CONTRIB))
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
    const path = getCranRepoPath(Path.join(CONTRIB, getCranPackageFilename(name, version)))
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
        await runScript('bundle_cran_package.sh', [name, version, libPath, CRAN_ROOT, 'build'], {showStdOut: true, showStdErr: true})
        log.info(`Bundled ${name}/${version}`)
        return true
    } catch (error) {
        log.warn(`Could not bundle ${name}/${version}`, error)
        return false
    }
}

const verifyCranPackage = async (name, version) => {
    const path = getCranRepoPath(Path.join(CONTRIB_UNVERIFIED, getCranPackageFilename(name, version)))
    try {
        log.debug(`Verifying ${name}/${version}`)
        await runScript('verify_package.r', [name, path, libPath])
        log.info(`Verified ${name}/${version}`)
        return true
    } catch (error) {
        log.warn(`Could not verify ${name}/${version}`, error)
        return false
    }
}

const deployCranPackage = async (name, version) => {
    try {
        log.debug(`Deploying ${name}/${version}`)
        await runScript('bundle_cran_package.sh', [name, version, libPath, CRAN_ROOT, 'deploy'], {showStdOut: true, showStdErr: true})
        log.info(`Deployed ${name}/${version}`)
        return true
    } catch (error) {
        log.warn(`Could not deploy ${name}/${version}`, error)
        return false
    }
}

const cleanupCranPackage = async (name, version) => {
    try {
        log.debug(`Cleaning up ${name}/${version}`)
        await runScript('bundle_cran_package.sh', [name, version, libPath, CRAN_ROOT, 'cleanup'], {showStdOut: true, showStdErr: true})
        log.info(`Cleaned up ${name}/${version}`)
        return true
    } catch (error) {
        log.warn(`Could not clean up ${name}/${version}`, error)
        return false
    }
}

const makeCranPackage = async (name, version, repo) => {
    const success = await isCranPackageCached(name, version) || (
        await installCranPackage(name, version, repo)
            && await bundleCranPackage(name, version)
            && await verifyCranPackage(name, version)
            && await deployCranPackage(name, version)
    )
    await cleanupCranPackage(name, version)
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
